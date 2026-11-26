// Verification codes by email and text. Dev logs to the console; Azure sends through
// Azure Communication Services. Messages never mention what a site is about, so a code
// arriving on a shared phone or inbox gives nothing away (sensitive sites especially).
import { EmailClient } from '@azure/communication-email';
import { SmsClient } from '@azure/communication-sms';
import type { Notifier, Site } from '@whatbox/core';
import { config } from './config';

export function codeText(site: Site, code: string) {
  return `${code} is your ${site.name} sign-in code. It expires in 10 minutes. If you didn't ask for it, ignore this message.`;
}

export const consoleNotifier: Notifier = {
  async sendCode({ site, channel, target, code }) {
    const masked = channel === 'email' ? target.replace(/^(.).*@/, '$1•••@') : '•••' + target.slice(-2);
    console.log(`[notify] ${site.slug} ${channel} ${masked} code=${config.exposeDevCodes ? code : '(hidden)'}`);
  },
  async sendAdminCode({ email, code }) {
    console.log(`[notify] admin ${email.replace(/^(.).*@/, '$1•••@')} code=${config.exposeDevCodes ? code : '(hidden)'}`);
  },
};

export class AcsNotifier implements Notifier {
  private email: EmailClient;
  private sms: SmsClient;
  constructor(
    connectionString: string,
    private emailFrom: Record<string, string>, // site id -> verified sender, e.g. "DoNotReply@mail.afterh.com"
    private smsFrom: Record<string, string>, // site id -> number; "*" is the shared toll-free number
  ) {
    this.email = new EmailClient(connectionString);
    this.sms = new SmsClient(connectionString);
  }

  async sendCode({ site, channel, target, code }: Parameters<Notifier['sendCode']>[0]) {
    if (channel === 'email') {
      const from = this.emailFrom[site.id] ?? this.emailFrom['*'];
      if (!from) throw new Error(`No email sender configured for ${site.id}`);
      const poller = await this.email.beginSend({
        senderAddress: from,
        recipients: { to: [{ address: target }] },
        content: {
          subject: `Your ${site.name} code: ${code}`,
          plainText: codeText(site, code),
          html: `<p style="font:16px/1.5 sans-serif">Your ${escapeHtml(site.name)} sign-in code is</p>
<p style="font:700 28px/1.2 monospace;letter-spacing:4px">${code}</p>
<p style="font:14px/1.5 sans-serif;color:#555">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`,
        },
      });
      // Wait only for acceptance; delivery is asynchronous.
      await poller.poll();
      return;
    }
    const from = this.smsFrom[site.id] ?? this.smsFrom['*'];
    if (!from) throw new Error(`No SMS number configured for ${site.id}`);
    const [res] = await this.sms.send({ from, to: [target], message: codeText(site, code) });
    if (!res.successful) throw new Error(`SMS send failed: ${res.httpStatusCode} ${res.errorMessage ?? ''}`);
  }

  async sendAdminCode({ email, code }: { email: string; code: string }) {
    const from = this.emailFrom['admin'] ?? this.emailFrom['*'];
    if (!from) throw new Error('No admin email sender configured');
    const poller = await this.email.beginSend({
      senderAddress: from,
      recipients: { to: [{ address: email }] },
      content: { subject: `WhatBox admin code: ${code}`, plainText: `${code} is your WhatBox admin sign-in code. It expires in 10 minutes.` },
    });
    await poller.poll();
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function createNotifier(): Notifier {
  if (config.notifier === 'acs') {
    if (!config.acsConnectionString) throw new Error('NOTIFIER=acs needs ACS_CONNECTION_STRING.');
    return new AcsNotifier(config.acsConnectionString, parse(config.acsEmailFromJson), parse(config.acsSmsFromJson));
  }
  return consoleNotifier;
}

function parse(json: string): Record<string, string> {
  return json ? JSON.parse(json) : {};
}
