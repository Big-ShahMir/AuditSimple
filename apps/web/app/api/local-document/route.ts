import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get("path");

    if (!filePath || !filePath.startsWith("local://uploads/")) {
        return new NextResponse("Invalid path", { status: 400 });
    }

    // Extract the relative path after "local://uploads/"
    const relativePath = filePath.replace("local://uploads/", "");
    const absolutePath = path.join(process.cwd(), "uploads", relativePath);

    if (!fs.existsSync(absolutePath)) {
        return new NextResponse("File not found", { status: 404 });
    }

    const fileBuffer = fs.readFileSync(absolutePath);

    // Determine content type
    let contentType = "application/octet-stream";
    if (absolutePath.endsWith(".pdf")) contentType = "application/pdf";
    else if (absolutePath.endsWith(".png")) contentType = "image/png";
    else if (absolutePath.endsWith(".jpg") || absolutePath.endsWith(".jpeg")) contentType = "image/jpeg";

    const isDownload = searchParams.get("download") === "true";
    const headers: Record<string, string> = {
        "Content-Type": contentType,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (isDownload) {
        headers["Content-Disposition"] = `attachment; filename="${path.basename(absolutePath)}"`;
    }

    return new NextResponse(fileBuffer, { headers });
}
