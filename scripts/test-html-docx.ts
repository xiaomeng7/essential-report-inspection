import { asBlob } from "html-docx-js-typescript";
import * as fs from "fs";
import PizZip from "pizzip";

async function testHtmlDocx() {
  console.log("=== Testing html-docx-js-typescript ===\n");
  
  const simpleHtml = `
    <h1>Test Document</h1>
    <p>This is a test paragraph.</p>
    <p>Second paragraph with <strong>bold</strong> text.</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
  `;
  
  console.log("Input HTML length:", simpleHtml.length);
  console.log("Converting HTML to DOCX...");
  
  try {
    const result = await asBlob(simpleHtml, {
      pageSize: {
        width: 12240,
        height: 15840,
      },
    });
    
    console.log("Result type:", result.constructor.name);
    console.log("Is Buffer:", Buffer.isBuffer(result));
    
    let buffer: Buffer;
    if (Buffer.isBuffer(result)) {
      buffer = result;
    } else {
      buffer = Buffer.from(await (result as Blob).arrayBuffer());
    }
    
    console.log("Buffer length:", buffer.length);
    
    // Read document.xml from the generated DOCX
    const zip = new PizZip(buffer);
    const docEntry = zip.files["word/document.xml"];
    const docXml = docEntry ? (docEntry as { asText?: () => string }).asText?.() ?? "" : "";
    
    console.log("document.xml length:", docXml.length);
    console.log("document.xml preview (first 500 chars):");
    console.log(docXml.substring(0, 500));
    
    // Save to file for inspection
    fs.writeFileSync("/tmp/test-html-docx.docx", buffer);
    console.log("\nSaved to: /tmp/test-html-docx.docx");
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testHtmlDocx();
