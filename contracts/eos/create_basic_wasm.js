const fs = require('fs');

// Create a minimal valid WASM file for testing
// This is a basic WASM module that does nothing but is structurally valid
const wasmBytes = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // WASM magic number
  0x01, 0x00, 0x00, 0x00, // WASM version
  
  // Type section
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  
  // Function section
  0x03, 0x02, 0x01, 0x00,
  
  // Export section (export apply function)
  0x07, 0x09, 0x01, 0x05, 0x61, 0x70, 0x70, 0x6c, 0x79, 0x00, 0x00,
  
  // Code section (empty apply function)
  0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b
]);

fs.writeFileSync('./build/counter.wasm', Buffer.from(wasmBytes));
console.log('Basic WASM created for testing purposes');
console.log('Note: This is a placeholder WASM - replace with properly compiled contract');