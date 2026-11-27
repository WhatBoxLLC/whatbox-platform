// Signed photo URLs must be well-formed, or browsers show an empty box instead of the photo.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedSites } from '@whatbox/core';
import { AzureBlobPhotoStore } from '../src/photos';

test('Azure photo URLs have a single slash before the container', () => {
  const store = new AzureBlobPhotoStore({ account: 'acct', key: Buffer.from('k').toString('base64') }, {});
  const url = new URL(store.readUrl(seedSites(new Date())[0], 'm_1/ph_2'));
  assert.equal(url.host, 'acct.blob.core.windows.net');
  assert.equal(url.pathname, '/photos-afterh/m_1/ph_2.jpg');
  assert.equal(url.searchParams.get('sp'), 'r');
});
