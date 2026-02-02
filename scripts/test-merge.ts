import HTMLtoDOCX from "html-to-docx";
import * as fs from "fs";
import PizZip from "pizzip";

async function testMerge() {
  console.log("=== Testing Manual DOCX Merge ===\n");
  
  // Create simple cover
  const coverHtml = `<!DOCTYPE html>
<html><head></head><body>
<h1>Cover Page</h1>
<p>Property Address: 123 Test St</p>
</body></html>`;
  
  const coverBuffer = await HTMLtoDOCX(coverHtml, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  
  // Create simple body
  const bodyHtml = `<!DOCTYPE html>
<html><head></head><body>
<h2>Report Body</h2>
<p>This is the report content.</p>
<ul><li>Finding 1</li><li>Finding 2</li></ul>
</body></html>`;
  
  const bodyBuffer = await HTMLtoDOCX(bodyHtml, null, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  
  console.log("Cover buffer length:", coverBuffer.length);
  console.log("Body buffer length:", bodyBuffer.length);
  
  // Manual merge
  const coverZip = new PizZip(coverBuffer);
  const bodyZip = new PizZip(bodyBuffer);
  
  // Extract body content
  const bodyDocEntry = bodyZip.files["word/document.xml"];
  const bodyDocXml = bodyDocEntry.asText();
  const bodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/i.exec(bodyDocXml);
  
  if (!bodyMatch) {
    console.error("Cannot find <w:body> in body DOCX");
    return;
  }
  
  const bodyContent = bodyMatch[1];
  console.log("Body content length:", bodyContent.length);
  
  // Extract cover content
  const coverDocEntry = coverZip.files["word/document.xml"];
  let coverDocXml = coverDocEntry.asText();
  
  // Insert body content before </w:body>
  const coverBodyMatch = /<w:body[^>]*>([\s\S]*?)<\/w:body>/i.exec(coverDocXml);
  if (!coverBodyMatch) {
    console.error("Cannot find <w:body> in cover DOCX");
    return;
  }
  
  const coverBodyInner = coverBodyMatch[1];
  const mergedBodyInner = coverBodyInner + "\n" + bodyContent;
  
  const mergedDocXml = coverDocXml.replace(
    /<w:body[^>]*>[\s\S]*?<\/w:body>/i,
    `<w:body>${mergedBodyInner}</w:body>`
  );
  
  // Update cover ZIP
  coverZip.file("word/document.xml", mergedDocXml);
  
  // Generate merged buffer
  const mergedBuffer = coverZip.generate({ type: "nodebuffer" }) as Buffer;
  
  console.log("Merged buffer length:", mergedBuffer.length);
  
  // Verify
  const verifyZip = new PizZip(mergedBuffer);
  const verifyDocEntry = verifyZip.files["word/document.xml"];
  const verifyDocXml = verifyDocEntry.asText();
  
  console.log("Merged document.xml length:", verifyDocXml.length);
  console.log("Has 'Cover Page':", verifyDocXml.includes("Cover Page"));
  console.log("Has 'Report Body':", verifyDocXml.includes("Report Body"));
  console.log("Has 'Finding 1':", verifyDocXml.includes("Finding 1"));
  
  // Save
  fs.writeFileSync("/tmp/test-merged.docx", mergedBuffer);
  console.log("\n✅ Saved to: /tmp/test-merged.docx");
  console.log("Try opening it in Word to verify content");
}

testMerge().catch(console.error);
