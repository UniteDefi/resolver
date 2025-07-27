#[test_only]
module unite_defi::dutch_auction_tests {
    use std::vector;
    use aptos_framework::coin;
    use aptos_framework::aptos_coin::{Self, AptosCoin};
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use unite_defi::dutch_auction;

    struct TestCoin {}

    fun setup_test(aptos_framework: &signer, unite_defi_account: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
        
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestCoin>(
            unite_defi_account,
            string::utf8(b"Test Coin"),
            string::utf8(b"TEST"),
            8,
            false,
        );
        coin::destroy_freeze_cap(freeze_cap);
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_mint_cap(mint_cap);
        
        aptos_coin::initialize_for_test(aptos_framework);
        dutch_auction::initialize(unite_defi_account);
    }

    #[test(aptos_framework = @0x1, unite_defi = @unite_defi, seller = @0x123)]
    fun test_create_auction(
        aptos_framework: &signer,
        unite_defi: &signer,
        seller: &signer,
    ) {
        setup_test(aptos_framework, unite_defi);
        
        let hash_secret = x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        dutch_auction::create_auction<TestCoin>(
            seller,
            1000000, // 0.01 TEST
            200,     // start price
            100,     // end price
            300,     // 5 minutes
            hash_secret,
        );
        
        let (seller_addr, token_amount, start_price, end_price, _, duration, active, returned_hash) = 
            dutch_auction::get_auction_details(0);
        
        assert!(seller_addr == @0x123, 0);
        assert!(token_amount == 1000000, 1);
        assert!(start_price == 200, 2);
        assert!(end_price == 100, 3);
        assert!(duration == 300, 4);
        assert!(active == true, 5);
        assert!(returned_hash == hash_secret, 6);
    }

    #[test(aptos_framework = @0x1, unite_defi = @unite_defi, seller = @0x123, buyer = @0x456)]
    fun test_settle_auction(
        aptos_framework: &signer,
        unite_defi: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        setup_test(aptos_framework, unite_defi);
        
        let seller_addr = signer::address_of(seller);
        let buyer_addr = signer::address_of(buyer);
        
        account::create_account_for_test(seller_addr);
        account::create_account_for_test(buyer_addr);
        
        let hash_secret = x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        dutch_auction::create_auction<TestCoin>(
            seller,
            1000000,
            200,
            100,
            300,
            hash_secret,
        );
        
        timestamp::fast_forward_seconds(150);
        
        let current_price = dutch_auction::get_current_price(0);
        assert!(current_price == 150, 0);
        
        let payment = coin::mint<TestCoin>(150, &coin::create_signer_with_capability(&mint_cap));
        dutch_auction::settle_auction<TestCoin>(buyer, 0, payment);
        
        let is_active = dutch_auction::is_auction_active(0);
        assert!(!is_active, 1);
    }

    #[test(aptos_framework = @0x1, unite_defi = @unite_defi, seller = @0x123)]
    fun test_cancel_auction(
        aptos_framework: &signer,
        unite_defi: &signer,
        seller: &signer,
    ) {
        setup_test(aptos_framework, unite_defi);
        
        let hash_secret = x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        dutch_auction::create_auction<TestCoin>(
            seller,
            1000000,
            200,
            100,
            300,
            hash_secret,
        );
        
        dutch_auction::cancel_auction(seller, 0);
        
        let is_active = dutch_auction::is_auction_active(0);
        assert!(!is_active, 0);
    }

    #[test(aptos_framework = @0x1, unite_defi = @unite_defi, seller = @0x123)]
    #[expected_failure(abort_code = dutch_auction::E_AUCTION_EXPIRED)]
    fun test_settle_expired_auction_fails(
        aptos_framework: &signer,
        unite_defi: &signer,
        seller: &signer,
        buyer: &signer,
    ) {
        setup_test(aptos_framework, unite_defi);
        
        let hash_secret = x"1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
        
        dutch_auction::create_auction<TestCoin>(
            seller,
            1000000,
            200,
            100,
            300,
            hash_secret,
        );
        
        timestamp::fast_forward_seconds(301);
        
        let payment = coin::mint<TestCoin>(100, &coin::create_signer_with_capability(&mint_cap));
        dutch_auction::settle_auction<TestCoin>(buyer, 0, payment);
    }
}