/**
 * Projects API Route — /api/projects
 *
 * GET    ?entityId=&entityType=   List projects
 * POST   { project }              Save / upsert a project
 * DELETE ?id=                     Delete a project
 */

import { NextRequest, NextResponse } from 'next/server';
import { projectService } from '../../../src/microservices/project.service';

export async function GET(req: NextRequest) {
  try {
    const p          = req.nextUrl.searchParams;
    const entityId   = p.get('entityId')   ?? undefined;
    const entityType = p.get('entityType') ?? undefined;
    const projects   = await projectService.getProjects(entityId, entityType);
    return NextResponse.json(projects);
  } catch (err) {
    console.error('[GET /api/projects]', err);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body  = await req.json();
    const saved = await projectService.saveProject(body);
    return NextResponse.json(saved, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid project payload.' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });
  await projectService.deleteProject(id);
  return NextResponse.json({ ok: true });
}
