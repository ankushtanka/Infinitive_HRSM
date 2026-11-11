import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, checkPermissions } from '@/lib/auth';
import {
  uploadFileToGridFS,
  getFileStreamFromGridFS,
  deleteFileFromGridFS,
  connectToDatabase,
} from '@/lib/mongodb';
import { validateFileMagicBytes } from '@/lib/fileValidation';
import { getSafeErrorMessage } from '@/lib/errorSanitizer';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// 1. POST: Upload Profile Image to MongoDB GridFS (Authenticated)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const previousFileId = formData.get('previousFileId') as string | null;

    if (!file) {
      return NextResponse.json(
        { success: false, message: 'No image file uploaded.' },
        { status: 400 }
      );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid file format. Only JPG, JPEG, PNG, and WEBP images are allowed.',
        },
        { status: 400 }
      );
    }

    // Validate File Size (<= 5 MB)
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          message: `File size exceeds maximum 5 MB limit. Selected file is ${(
            file.size /
            (1024 * 1024)
          ).toFixed(2)} MB.`,
        },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Validate magic bytes and dangerous extensions
    const fileValidation = validateFileMagicBytes(buffer, file.name);
    if (!fileValidation.valid) {
      return NextResponse.json(
        { success: false, message: fileValidation.error || 'Invalid file contents.' },
        { status: 400 }
      );
    }

    // Delete previous GridFS file if updating
    if (previousFileId) {
      await deleteFileFromGridFS(previousFileId).catch(() => {});
    }

    // Save binary stream in MongoDB GridFS photos bucket
    const fileId = await uploadFileToGridFS(file.name, file.type, buffer);
    const photoUrl = `/api/v1/admin/profile/photo?id=${fileId}`;

    const isEmployeePhoto = formData.get('isEmployeePhoto') === 'true';
    const targetEmployeeId = (formData.get('targetEmployeeId') as string | null)?.trim();

    const { db } = await connectToDatabase();

    // If uploading for an employee record (Add/Edit employee), update target employee or skip caller's avatar
    if (isEmployeePhoto) {
      if (targetEmployeeId) {
        await db.collection('users').updateOne(
          { employeeId: targetEmployeeId },
          {
            $set: {
              profilePhotoId: fileId,
              avatar: photoUrl,
              updatedAt: new Date(),
            },
          }
        );
      }
    } else {
      // Normal self profile photo update for logged-in user
      await db.collection('users').updateOne(
        { $or: [{ id: auth.userId }, { email: auth.email }, { employeeId: auth.employeeId }] },
        {
          $set: {
            profilePhotoId: fileId,
            avatar: photoUrl,
            updatedAt: new Date(),
          },
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Profile photo uploaded successfully to MongoDB GridFS!',
      fileId,
      photoUrl,
    });
  } catch (error: any) {
    console.error('Error in POST /api/v1/admin/profile/photo:', error);
    return NextResponse.json(
      {
        success: false,
        message: getSafeErrorMessage(error, 'Failed to upload image to MongoDB GridFS.'),
      },
      { status: 500 }
    );
  }
}

// 2. GET: Stream binary image from MongoDB GridFS (Authenticated)
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    const perm = checkPermissions(auth);
    if (!perm.isAllowed) {
      return NextResponse.json({ success: false, message: perm.message }, { status: perm.statusCode });
    }

    const { searchParams } = new URL(request.url);
    let fileId = searchParams.get('id');

    // If no ID in searchParams, check user document for photo ID
    if (!fileId) {
      const { db } = await connectToDatabase();
      const user = await db.collection('users').findOne({
        $or: [{ id: auth.userId }, { email: auth.email }],
      });
      if (user && user.profilePhotoId) {
        fileId = user.profilePhotoId;
      }
    }

    if (!fileId) {
      return NextResponse.json(
        { success: false, message: 'Photo ID is missing or not found.' },
        { status: 404 }
      );
    }

    const fileResult = await getFileStreamFromGridFS(fileId);
    if (!fileResult) {
      return NextResponse.json(
        { success: false, message: 'Image binary not found in MongoDB GridFS.' },
        { status: 404 }
      );
    }

    return new NextResponse(fileResult.stream as any, {
      status: 200,
      headers: {
        'Content-Type': fileResult.contentType,
        'Content-Disposition': `inline; filename="${fileResult.filename}"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/v1/admin/profile/photo:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to retrieve photo from GridFS.' },
      { status: 500 }
    );
  }
}
