import { readFile } from 'node:fs/promises';
const UID = 'BQbwiHs1Y3Wsz1yaT2JizWVWOLG2';
export async function prepareAuth(context) {
  const config = (await readFile(new URL('../../shared/firebase-config.js', import.meta.url), 'utf8')).replace("projectId: 'minibudget-4e474'", "projectId: 'demo-budget-control'").replace("apiKey: 'AIzaSyBzHEcrGfwek6FzguWbSGSfMgebMy1sBe8'", "apiKey: 'demo-api-key'").replace("authDomain: 'minibudget-4e474.firebaseapp.com'", "authDomain: '127.0.0.1'").replace('  sdkVersion:', '  emulators: true,\n  sdkVersion:');
  await context.route('**/shared/firebase-config.js', route => route.fulfill({ contentType: 'text/javascript', body: config }));
  await context.addInitScript(() => localStorage.setItem('budget-control.mode', 'local'));
}
export async function ownerLogin(page) {
  await page.waitForFunction(() => !!globalThis.MyApps?.auth);
  const token = [Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({ iss: 'emulator', sub: 'emulator', aud: 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, uid: UID })).toString('base64url'), ''].join('.');
  await page.evaluate(token => MyApps.auth.signInWithCustomToken(token), token);
}
