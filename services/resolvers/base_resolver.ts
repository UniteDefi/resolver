import {ethers} from 'ethers'
import {Logger} from '../common/logger'
import {CHAINS, AUCTION_ABI, AuctionInfo, ResolverConfig} from '../common/config'

export class BaseResolver {
    protected logger: Logger
    protected providers: Map<string, ethers.Provider> = new Map()
    protected contracts: Map<string, ethers.Contract> = new Map()
    protected wallet: ethers.Wallet
    protected activeAuctions: Map<string, AuctionInfo> = new Map()
    protected processingAuctions: Set<string> = new Set()

    constructor(protected config: ResolverConfig) {
        this.logger = new Logger(`Resolver-${config.id}`)
        this.wallet = new ethers.Wallet(config.privateKey)
        this.initializeProviders()
    }

    private initializeProviders() {
        for (const chain of this.config.chains) {
            const chainConfig = CHAINS[chain as keyof typeof CHAINS]
            if (!chainConfig) {
                this.logger.error(`Unknown chain: ${chain}`)
                continue
            }

            const provider = new ethers.JsonRpcProvider(chainConfig.rpc)
            const signer = this.wallet.connect(provider)
            const contract = new ethers.Contract(chainConfig.auctionContract, AUCTION_ABI, signer)

            this.providers.set(chain, provider)
            this.contracts.set(chain, contract)

            this.logger.log(`Initialized provider for ${chain}`)
        }
    }

    async start() {
        this.logger.log('Starting resolver service...')

        // Check balances
        await this.checkBalances()

        // Listen for new auctions
        this.listenForAuctions()

        // Monitor existing auctions
        setInterval(() => this.monitorAuctions(), 5000)
    }

    private async checkBalances() {
        for (const [chain, provider] of this.providers) {
            try {
                this.logger.log(`Checking balance for ${this.wallet.address}...`)
                const balance = await provider.getBalance(this.wallet.address)
                this.logger.log(`Balance on ${chain}: ${ethers.formatEther(balance)} ETH`)

                if (balance < ethers.parseEther(this.config.minBalanceWei)) {
                    this.logger.warn(`Low balance on ${chain}!`)
                }
            } catch (error) {
                this.logger.error(`Failed to check balance on ${chain}:`, error)
            }
        }
    }

    private listenForAuctions() {
        for (const [chain, contract] of this.contracts) {
            contract.on(
                'AuctionCreated',
                async (
                    auctionId: string,
                    seller: string,
                    token: string,
                    amount: bigint,
                    startPrice: bigint,
                    endPrice: bigint,
                    duration: bigint,
                    event: any
                ) => {
                    const auctionInfo: AuctionInfo = {
                        auctionId,
                        seller,
                        token,
                        amount,
                        startPrice,
                        endPrice,
                        startTime: (await event.getBlock()).timestamp,
                        duration: Number(duration),
                        chain
                    }

                    this.logger.log(`New auction detected on ${chain}:`, {
                        auctionId,
                        startPrice: ethers.formatEther(startPrice),
                        endPrice: ethers.formatEther(endPrice),
                        duration: Number(duration)
                    })

                    this.activeAuctions.set(auctionId, auctionInfo)
                    this.evaluateAuction(auctionInfo)
                }
            )

            contract.on('AuctionSettled', (auctionId: string, buyer: string, price: bigint) => {
                this.logger.log(`Auction settled on ${chain}:`, {
                    auctionId,
                    buyer,
                    price: ethers.formatEther(price),
                    wasOurs: buyer.toLowerCase() === this.wallet.address.toLowerCase()
                })

                this.activeAuctions.delete(auctionId)
                this.processingAuctions.delete(auctionId)
            })

            contract.on('AuctionCancelled', (auctionId: string) => {
                this.logger.log(`Auction cancelled on ${chain}:`, auctionId)
                this.activeAuctions.delete(auctionId)
                this.processingAuctions.delete(auctionId)
            })
        }
    }

    private async monitorAuctions() {
        for (const [auctionId, auction] of this.activeAuctions) {
            if (!this.processingAuctions.has(auctionId)) {
                await this.evaluateAuction(auction)
            }
        }
    }

    private async evaluateAuction(auction: AuctionInfo) {
        try {
            const contract = this.contracts.get(auction.chain)
            if (!contract) return

            // Get current price
            const currentPrice = await contract.getCurrentPrice(auction.auctionId)
            const totalCost = (currentPrice * auction.amount) / ethers.parseEther('1')

            this.logger.log(`Evaluating auction ${auction.auctionId}:`, {
                currentPrice: ethers.formatEther(currentPrice),
                totalCost: ethers.formatEther(totalCost),
                maxPrice: this.config.maxPriceWei
            })

            // Check if price is acceptable
            if (totalCost <= ethers.parseEther(this.config.maxPriceWei)) {
                // Add competition delay
                const delay = Math.random() * this.config.competitionDelayMs
                this.logger.log(`Waiting ${delay.toFixed(0)}ms before attempting to settle...`)

                setTimeout(() => this.attemptSettle(auction, totalCost), delay)
                this.processingAuctions.add(auction.auctionId)
            }
        } catch (error) {
            this.logger.error(`Failed to evaluate auction:`, error)
        }
    }

    private async attemptSettle(auction: AuctionInfo, expectedCost: bigint) {
        try {
            const contract = this.contracts.get(auction.chain)
            if (!contract) return

            // Double-check the auction is still active
            const auctionData = await contract.getAuction(auction.auctionId)
            if (!auctionData.isActive) {
                this.logger.warn(`Auction ${auction.auctionId} is no longer active`)
                return
            }

            // Recalculate current price
            const currentPrice = await contract.getCurrentPrice(auction.auctionId)
            const totalCost = (currentPrice * auction.amount) / ethers.parseEther('1')

            this.logger.log(`Attempting to settle auction ${auction.auctionId} at ${ethers.formatEther(totalCost)} ETH`)

            // Send transaction with 10% buffer for gas/price changes
            const tx = await contract.settleAuction(auction.auctionId, {
                value: (totalCost * 110n) / 100n
            })

            this.logger.log(`Settlement transaction sent:`, tx.hash)

            const receipt = await tx.wait()
            this.logger.success(`Auction settled successfully! Gas used: ${receipt.gasUsed}`)
        } catch (error: any) {
            if (error.message?.includes('Auction is not active')) {
                this.logger.warn(`Auction already settled by another resolver`)
            } else {
                this.logger.error(`Failed to settle auction:`, error.message)
            }
        } finally {
            this.processingAuctions.delete(auction.auctionId)
        }
    }

    async stop() {
        this.logger.log('Stopping resolver service...')

        // Remove all listeners
        for (const contract of this.contracts.values()) {
            contract.removeAllListeners()
        }

        // Close providers
        for (const provider of this.providers.values()) {
            if ('destroy' in provider && typeof provider.destroy === 'function') {
                await provider.destroy()
            }
        }
    }
}
