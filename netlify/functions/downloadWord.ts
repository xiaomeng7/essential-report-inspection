import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { getWordDoc } from "./lib/store";

export const handler: Handler = async (event: HandlerEvent, _ctx: HandlerContext) => {
  if (event.httpMethod !== "GET") {
    return { 
      statusCode: 405, 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Method Not Allowed" })
    };
  }

  try {
    // Get inspection_id from query string
    const inspectionId = event.queryStringParameters?.inspection_id;
    
    if (!inspectionId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "inspection_id is required" })
      };
    }

    // Get Word document from Blob
    const blobKey = `word/${inspectionId}.docx`;
    console.log("Fetching Word document:", blobKey);
    const buffer = await getWordDoc(blobKey, event);
    
    if (!buffer) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Word document not found" })
      };
    }

    // Return file as download
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Inspection_Report_${inspectionId}.docx"`,
        "Content-Length": buffer.length.toString(),
      },
      body: buffer.toString("base64"),
      isBase64Encoded: true,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error occurred";
    console.error("Error downloading Word document:", e);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        error: "Failed to download Word document",
        message: errorMessage
      })
    };
  }
};
