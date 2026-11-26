// NestJS HTTP layer. Controllers are thin: resolve the site and session, call the shared Platform.
import {
  ArgumentsHost, Body, Catch, Controller, Delete, ExceptionFilter, Get, Global, Headers, HttpException, Inject, Module,
  Param, Patch, Post, Put, Query, Req,
} from '@nestjs/common';
import { type ClientPlatform, type ContentPage, type Platform, type ProfileFieldDef, RuleError, type SearchFilters } from '@whatbox/core';
import type { Request, Response } from 'express';

export const PLATFORM = 'PLATFORM';

function bearer(auth?: string) {
  return auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
}
function clientPlatform(v?: string): ClientPlatform {
  return v === 'ios' || v === 'android' ? v : 'web';
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(e: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (e instanceof RuleError) return res.status(e.status).json({ code: e.code, message: e.message });
    if (e instanceof HttpException) return res.status(e.getStatus()).json({ code: 'http_' + e.getStatus(), message: e.message });
    console.error(e);
    return res.status(500).json({ code: 'internal', message: 'Something went wrong.' });
  }
}

abstract class SiteScoped {
  constructor(protected p: Platform) {}
  protected site(req: Request) {
    const key = (req.headers['x-site'] as string) || req.hostname;
    return this.p.resolveSite(key);
  }
  protected async ctx(req: Request) {
    const site = await this.site(req);
    return this.p.memberCtx(site, bearer(req.headers.authorization), clientPlatform(req.headers['x-client-platform'] as string));
  }
}

@Controller('v1')
export class PublicController extends SiteScoped {
  constructor(@Inject(PLATFORM) p: Platform) { super(p); }
  @Get('health') health() { return { ok: true }; }
  @Get('site') async site_(@Req() r: Request) { return this.p.publicSite(await this.site(r)); }
  @Get('site/pages') async pages(@Req() r: Request) { return this.p.publicPages(await this.site(r)); }
  @Get('site/pages/:slug') async page(@Req() r: Request, @Param('slug') slug: string) {
    return (await this.p.publicPage(await this.site(r), slug)) ?? null;
  }
  @Post('auth/start') async start(@Req() r: Request, @Body() b: { channel: 'email' | 'phone'; target: string }) {
    return this.p.startVerification(await this.site(r), b.channel, String(b.target ?? ''));
  }
  @Post('auth/verify') async verify(@Req() r: Request, @Body() b: { challengeId: string; code: string }) {
    return this.p.verifyCode(await this.site(r), String(b.challengeId), String(b.code));
  }
  @Post('auth/sign-out') async signOut(@Req() r: Request) {
    const t = bearer(r.headers.authorization);
    if (t) await this.p.signOut(await this.site(r), t);
    return { ok: true };
  }
}

@Controller('v1/me')
export class MeController extends SiteScoped {
  constructor(@Inject(PLATFORM) p: Platform) { super(p); }
  @Get() async me(@Req() r: Request) { return this.p.myProfile(await this.ctx(r)); }
  @Patch() async update(@Req() r: Request, @Body() b: any) { return this.p.updateProfile(await this.ctx(r), b); }
  @Post('photos') async addPhoto(@Req() r: Request, @Body() b: any) {
    // Prototype keeps data URIs inline. Production uploads go to the site's own Blob container
    // via a short-lived SAS URL, and only the blob path is stored here.
    return this.p.addPhoto(await this.ctx(r), { kind: b.kind, rating: b.rating, url: b.url, tone: b.tone });
  }
  @Patch('photos/:id') async updPhoto(@Req() r: Request, @Param('id') id: string, @Body() b: any) {
    return this.p.updatePhoto(await this.ctx(r), id, { kind: b.kind, rating: b.rating });
  }
  @Delete('photos/:id') async delPhoto(@Req() r: Request, @Param('id') id: string) { return this.p.deletePhoto(await this.ctx(r), id); }
  @Post('upgrade') async upgrade(@Req() r: Request, @Body() b: { on?: boolean }) { return this.p.upgrade(await this.ctx(r), b.on !== false); }
  @Get('private-access') async access(@Req() r: Request) { return this.p.accessLists(await this.ctx(r)); }
  @Post('private-access/:viewerId') async decide(@Req() r: Request, @Param('viewerId') v: string, @Body() b: { action: 'grant' | 'deny' | 'revoke' }) {
    return this.p.decideAccess(await this.ctx(r), v, b.action);
  }
}

@Controller('v1/members')
export class MembersController extends SiteScoped {
  constructor(@Inject(PLATFORM) p: Platform) { super(p); }
  @Get() async search(@Req() r: Request, @Query('q') q?: string) {
    const f: SearchFilters = q ? JSON.parse(q) : {};
    return this.p.search(await this.ctx(r), f);
  }
  @Get(':id') async profile(@Req() r: Request, @Param('id') id: string) { return this.p.profile(await this.ctx(r), id); }
  @Post(':id/like') async like(@Req() r: Request, @Param('id') id: string) { return this.p.like(await this.ctx(r), id, true); }
  @Delete(':id/like') async unlike(@Req() r: Request, @Param('id') id: string) { return this.p.like(await this.ctx(r), id, false); }
  @Post(':id/block') async block(@Req() r: Request, @Param('id') id: string) { return this.p.block(await this.ctx(r), id, true); }
  @Delete(':id/block') async unblock(@Req() r: Request, @Param('id') id: string) { return this.p.block(await this.ctx(r), id, false); }
  @Post(':id/report') async report(@Req() r: Request, @Param('id') id: string, @Body() b: { reason?: string }) {
    return this.p.report(await this.ctx(r), id, String(b.reason ?? ''));
  }
  @Post(':id/private-access') async request(@Req() r: Request, @Param('id') id: string) { return { status: await this.p.requestAccess(await this.ctx(r), id) }; }
}

@Controller('v1')
export class SocialController extends SiteScoped {
  constructor(@Inject(PLATFORM) p: Platform) { super(p); }
  @Get('activity/:kind') async activity(@Req() r: Request, @Param('kind') kind: 'likes' | 'views' | 'mine') {
    if (!['likes', 'views', 'mine'].includes(kind)) throw new RuleError('bad_kind', 'Unknown list.', 404);
    return this.p.activity(await this.ctx(r), kind);
  }
  @Get('conversations') async list(@Req() r: Request) { return this.p.conversations(await this.ctx(r)); }
  @Get('conversations/unread') async unread(@Req() r: Request) { return { count: await this.p.unreadCount(await this.ctx(r)) }; }
  @Get('conversations/:id') async conv(@Req() r: Request, @Param('id') id: string) { return this.p.conversation(await this.ctx(r), id); }
  @Post('conversations/:id') async send(@Req() r: Request, @Param('id') id: string, @Body() b: { body: string }) {
    return this.p.send(await this.ctx(r), id, String(b.body ?? ''));
  }
  @Post('conversations/:id/share-contact') async share(@Req() r: Request, @Param('id') id: string) { return this.p.shareContact(await this.ctx(r), id); }
}

@Controller('v1/admin')
export class AdminController {
  constructor(@Inject(PLATFORM) private p: Platform) {}
  private admin(auth?: string) { return this.p.adminFromToken(bearer(auth)); }
  @Post('auth/start') start(@Body() b: { email: string }) { return this.p.adminStart(String(b.email ?? '')); }
  @Post('auth/verify') verify(@Body() b: { challengeId: string; code: string }) { return this.p.adminVerify(String(b.challengeId), String(b.code)); }
  @Get('me') async me(@Headers('authorization') a: string) {
    const ad = await this.admin(a);
    return { admin: { id: ad.id, email: ad.email, name: ad.name, role: ad.role }, sites: await this.p.adminSites(ad) };
  }
  @Get('sites/:site') async site(@Headers('authorization') a: string, @Param('site') s: string) { return this.p.adminSite(await this.admin(a), s); }
  @Patch('sites/:site') async upd(@Headers('authorization') a: string, @Param('site') s: string, @Body() b: any) {
    return this.p.adminUpdateSite(await this.admin(a), s, b);
  }
  @Put('sites/:site/fields/:key') async field(@Headers('authorization') a: string, @Param('site') s: string, @Body() b: ProfileFieldDef) {
    return this.p.adminSaveField(await this.admin(a), s, b);
  }
  @Delete('sites/:site/fields/:key') async delField(@Headers('authorization') a: string, @Param('site') s: string, @Param('key') k: string) {
    return this.p.adminDeleteField(await this.admin(a), s, k);
  }
  @Get('sites/:site/stats') async stats(@Headers('authorization') a: string, @Param('site') s: string) { return this.p.adminStats(await this.admin(a), s); }
  @Get('sites/:site/moderation') async mod(@Headers('authorization') a: string, @Param('site') s: string, @Query('status') st = 'pending') {
    return this.p.adminModeration(await this.admin(a), s, st as any);
  }
  @Post('sites/:site/moderation/:id') async decide(@Headers('authorization') a: string, @Param('site') s: string, @Param('id') id: string, @Body() b: { decision: 'approve' | 'reject' }) {
    return this.p.adminDecide(await this.admin(a), s, id, b.decision);
  }
  @Get('sites/:site/members') async members(@Headers('authorization') a: string, @Param('site') s: string, @Query('search') q?: string, @Query('page') page?: string) {
    return this.p.adminMembers(await this.admin(a), s, { search: q || undefined, page: Number(page) || 1 });
  }
  @Patch('sites/:site/members/:id') async memberStatus(@Headers('authorization') a: string, @Param('site') s: string, @Param('id') id: string, @Body() b: { status: 'active' | 'suspended' }) {
    return this.p.adminSetMemberStatus(await this.admin(a), s, id, b.status);
  }
  @Get('sites/:site/pages') async pages(@Headers('authorization') a: string, @Param('site') s: string) { return this.p.adminPages(await this.admin(a), s); }
  @Put('sites/:site/pages/:slug') async savePage(@Headers('authorization') a: string, @Param('site') s: string, @Body() b: ContentPage) {
    return this.p.adminSavePage(await this.admin(a), s, b);
  }
  @Delete('sites/:site/pages/:slug') async delPage(@Headers('authorization') a: string, @Param('site') s: string, @Param('slug') slug: string) {
    return this.p.adminDeletePage(await this.admin(a), s, slug);
  }
}

export function buildModule(platform: Platform) {
  @Global()
  @Module({
    controllers: [PublicController, MeController, MembersController, SocialController, AdminController],
    providers: [{ provide: PLATFORM, useValue: platform }],
  })
  class AppModule {}
  return AppModule;
}
