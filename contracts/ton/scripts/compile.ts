import { CompilerConfig } from "@ton/blueprint";
import { compile as compileFunc } from "@ton/blueprint";
import { Cell } from "@ton/core";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

export const compile: CompilerConfig = {
    lang: "func",
    targets: ["contracts/counter.fc"],
};

async function compileContract() {
    console.log("[Compile] Compiling Counter contract...");
    
    try {
        // Create build directory if it doesn't exist
        mkdirSync("build", { recursive: true });
        
        // Compile the contract
        const result = await compileFunc("Counter");
        
        // Save compiled contract
        const artifactPath = join("build", "Counter.compiled.json");
        writeFileSync(
            artifactPath,
            JSON.stringify({
                hex: result.toBoc().toString("hex"),
            }, null, 2)
        );
        
        console.log("[Compile] Contract compiled successfully!");
        console.log("[Compile] Artifact saved to:", artifactPath);
        
        return result;
    } catch (error) {
        console.error("[Compile] Compilation failed:", error);
        throw error;
    }
}

compileContract().catch(console.error);