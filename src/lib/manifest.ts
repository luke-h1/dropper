import type { Build } from './types';

function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function installManifest(
  build: Pick<Build, 'bundleId' | 'version' | 'name'>,
  ipaUrl: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escape(ipaUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>${escape(build.bundleId)}</string>
        <key>bundle-version</key>
        <string>${escape(build.version)}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>${escape(build.name)}</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}
