import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // 1. Check if pre-generated file exists in public/downloads or root
    const publicPath = path.join(process.cwd(), 'public', 'downloads', 'Experience_Cum_Relieving_Letter.docx');
    const rootPath = path.join(process.cwd(), 'Experience_Cum_Relieving_Letter.docx');

    let filePath = '';
    if (fs.existsSync(publicPath)) {
      filePath = publicPath;
    } else if (fs.existsSync(rootPath)) {
      filePath = rootPath;
    }

    if (filePath && fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      return new NextResponse(fileBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': 'attachment; filename="Experience_Cum_Relieving_Letter.docx"',
          'Content-Length': fileBuffer.length.toString(),
        },
      });
    }

    return NextResponse.json(
      { success: false, message: 'Document not found. Please generate the file.' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error serving experience letter docx:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to download docx' },
      { status: 500 }
    );
  }
}

