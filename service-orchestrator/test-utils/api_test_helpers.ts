import axios, { AxiosInstance, AxiosResponse } from "axios";
import { Server } from "http";

interface ApiTestConfig {
  baseURL: string;
  timeout?: number;
}

export class ApiTestHelper {
  private client: AxiosInstance;
  private servers: Server[] = [];

  constructor(config: ApiTestConfig) {
    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout || 5000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request/response logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[ApiTest] ${config.method?.toUpperCase()} ${config.url}`);
        if (config.data) {
          console.log(`[ApiTest] Request body:`, JSON.stringify(config.data, null, 2));
        }
        return config;
      },
      (error) => {
        console.error(`[ApiTest] Request error:`, error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        console.log(`[ApiTest] Response ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        if (error.response) {
          console.error(`[ApiTest] Response error ${error.response.status}:`, error.response.data);
        } else {
          console.error(`[ApiTest] Network error:`, error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make a GET request
   */
  async get<T = any>(path: string, params?: any): Promise<AxiosResponse<T>> {
    return this.client.get(path, { params });
  }

  /**
   * Make a POST request
   */
  async post<T = any>(path: string, data?: any): Promise<AxiosResponse<T>> {
    return this.client.post(path, data);
  }

  /**
   * Make a PUT request
   */
  async put<T = any>(path: string, data?: any): Promise<AxiosResponse<T>> {
    return this.client.put(path, data);
  }

  /**
   * Make a DELETE request
   */
  async delete<T = any>(path: string): Promise<AxiosResponse<T>> {
    return this.client.delete(path);
  }

  /**
   * Wait for a service to be healthy
   */
  async waitForService(healthPath: string = "/health", maxAttempts: number = 30, delayMs: number = 1000): Promise<void> {
    console.log(`[ApiTest] Waiting for service at ${this.client.defaults.baseURL}${healthPath}`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await this.client.get(healthPath);
        if (response.status === 200) {
          console.log(`[ApiTest] Service is healthy after ${i + 1} attempts`);
          return;
        }
      } catch (error) {
        // Service not ready yet
      }
      
      if (i < maxAttempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    
    throw new Error(`Service did not become healthy after ${maxAttempts} attempts`);
  }

  /**
   * Register a server for cleanup
   */
  registerServer(server: Server): void {
    this.servers.push(server);
  }

  /**
   * Clean up all registered servers
   */
  async cleanup(): Promise<void> {
    for (const server of this.servers) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => {
          if (err) {
            console.error("[ApiTest] Error closing server:", err);
            reject(err);
          } else {
            console.log("[ApiTest] Server closed successfully");
            resolve();
          }
        });
      });
    }
    this.servers = [];
  }
}

/**
 * Create a test order payload
 */
export function createTestOrder(overrides?: Partial<any>): any {
  const baseOrder = {
    orderId: `0x${Math.random().toString(16).substring(2)}`,
    chainId: 1,
    requester: "0x1234567890123456789012345678901234567890",
    inputAsset: "0x0000000000000000000000000000000000000001",
    outputAsset: "0x0000000000000000000000000000000000000002",
    inputAmount: "1000000000000000000", // 1 ETH
    outputAmount: "2000000000000000000", // 2 tokens
    recipient: "0x1234567890123456789012345678901234567890",
    creationTimestamp: Math.floor(Date.now() / 1000),
    fillDeadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    isExactInput: true,
    initialPrice: 2.0,
    finalPrice: 1.9,
    safetyFactor: 0.95,
    signature: "0xmocksignature",
  };

  return { ...baseOrder, ...overrides };
}

/**
 * Create EIP-712 order data
 */
export function createEIP712Order(overrides?: Partial<any>): any {
  const order = createTestOrder(overrides);
  
  return {
    order: {
      requester: order.requester,
      inputAsset: order.inputAsset,
      outputAsset: order.outputAsset,
      inputAmount: order.inputAmount,
      outputAmount: order.outputAmount,
      recipient: order.recipient,
      creationTimestamp: order.creationTimestamp,
      fillDeadline: order.fillDeadline,
      orderType: order.isExactInput ? 0 : 1, // 0 = EXACT_INPUT, 1 = EXACT_OUTPUT
    },
    dutchAuctionData: {
      startingInputAmount: order.inputAmount,
      endingInputAmount: order.inputAmount,
      startingOutputAmount: order.outputAmount,
      endingOutputAmount: order.outputAmount,
      startTime: order.creationTimestamp,
      endTime: order.fillDeadline,
    },
    signature: order.signature,
    chainId: order.chainId,
  };
}