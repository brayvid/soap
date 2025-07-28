// packages/web/src/app/api/revalidate/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';

// The 'export' keyword is the critical part that fixes the error.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tag, secret } = body;

    // 1. Check for the secret token to secure the endpoint
    if (secret !== process.env.REVALIDATION_TOKEN) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // 2. Check if a tag was provided
    if (!tag) {
      return NextResponse.json({ message: 'Missing tag param' }, { status: 400 });
    }
    
    // 3. Revalidate the specific cache tag
    revalidateTag(tag);
    
    // 4. Return a success response
    return NextResponse.json({ revalidated: true, tag: tag, now: Date.now() });
    
  } catch (error) {
    console.error("Revalidation API Error:", error);
    return NextResponse.json({ message: 'Error processing request' }, { status: 500 });
  }
}