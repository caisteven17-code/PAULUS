/**
 * Project Donations API Route — /api/projects/donations
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '../../../../src/microservices/project.service';

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get('projectId') ?? undefined;
    return NextResponse.json(await projectService.getDonations(projectId));
  } catch (err) {
    console.error('[GET /api/projects/donations]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json();
    const saved = await projectService.saveDonation(body);
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid donation payload.' }, { status: 400 });
  }
}
