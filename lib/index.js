/**
 * dsh-waaagh-ork — host half.
 *
 * This is a purely client-side UI plugin (green pixel Ork + "waaagh" masks),
 * so the host half is an intentional no-op. It only needs to exist so the
 * cordis loader can activate the `{ id: "waaagh-ork", name: "dsh-waaagh-ork" }`
 * entry inserted by cordis.patch.yml; the browser half lives in lib/client.js
 * and is served by dsh-client-modules via the package's `dsh.client` declaration.
 */

export const name = "dsh-waaagh-ork";
export const inject = [];

export function apply() {}
