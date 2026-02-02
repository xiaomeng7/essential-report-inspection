import HTMLtoDOCX from "html-to-docx";
import * as fs from "fs";
import PizZip from "pizzip";

async function testHtmlToDOCX() {
  console.log("=== Testing html-to-docx ===\n");
  
  const simpleHtml = `
    <!DOCTYPE html>
    <html>
    <head></head>
    <body>
    <h1>Test Document</h1>
    <p>This is a test paragraph.</p>
    <p>Second paragraph with <strong>bold</strong> text.</p>
    <ul>
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
    </body>
    </html>
  `;
  
  console.log("Input HTML length:", simpleHtml.length);
  console.log("Converting HTML to DOCX...");
  
  try {
    const buffer = await HTMLtoDOCX(simpleHtml, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });
    
    console.log("Buffer length:", buffer.length);
    
    // Read document.xml from the generated DOCX
    const zip = new PizZip(buffer);
    const docEntry = zip.files["word/document.xml"];
    const docXml = docEntry ? (docEntry as { asText?: () => string }).asText?.() ?? "" : "";
    
    console.log("document.xml length:", docXml.length);
    console.log("document.xml preview (first 800 chars):");
    console.log(docXml.substring(0, 800));
    
    // Check if content is actually in document.xml (not altChunk)
    const hasAltChunk = docXml.includes("altChunk");
    const hasActualContent = docXml.includes("Test Document") || docXml.includes("test paragraph");
    console.log("\nHas altChunk:", hasAltChunk);
    console.log("Has actual content in document.xml:", hasActualContent);
    
    // Save to file for inspection
    fs.writeFileSync("/tmp/test-html-to-docx.docx", buffer);
    console.log("\nSaved to: /tmp/test-html-to-docx.docx");
    
  } catch (error) {
    console.error("Error:", error);
  }
}

testHtmlToDOCX();
