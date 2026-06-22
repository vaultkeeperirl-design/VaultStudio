export type ChangelogEntry = {
  version: string;
  date: string;
  added?: string[];
  fixed?: string[];
  changed?: string[];
};

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: '1.5.1',
    date: '2026-06-22',
    added: [
      'Added in-app update checks: VaultStudio now tells you when a newer version is available and links straight to the download.',
      'Added the VaultStudio logo to the in-app release notes.',
    ],
    changed: [
      'Added explicit Windows/macOS/Linux packaging scripts, host-native installer smoke tests, and download slots; Windows ships now, while macOS and Linux stay blocked until their native VSS engine builds pass on those platforms.',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-06-22',
    changed: [
      'Reorganized all settings into a single Settings hub with a category sidebar - Stream, Destinations, Chat & Platforms, Reliability, Overlay, and License - so options are far easier to find.',
      'Merged the standalone Targets and Connections pages into the Settings hub; the studio top bar now shows a single Settings button (existing Targets and Connections links still open the matching section).',
    ],
  },
  {
    version: '1.4.18',
    date: '2026-06-22',
    added: [
      'Added a Cloudflare Worker payments backend for PayPal checkout with serialized Lifetime Pro key allocation.',
      'Added tests covering license persistence, dashboard gating, full-width settings pages, and payments key issuance.',
    ],
    fixed: [
      'Fixed persisted Lifetime Pro loading so signed keys survive installed-app restarts without trusting mutable stored payloads.',
      'Fixed deactivation so the installed app returns to Free cleanly after removing a Lifetime Pro key.',
      'Enforced the 3-target Free limit for stream targets and dashboard-enabled platforms, including OAuth-created platforms.',
      'Made Settings, Connections, and Targets pages use the full content width.',
      'Removed misleading alternate-payment copy so checkout messaging only points users to PayPal.',
    ],
  },
  {
    version: '1.4.17',
    date: '2026-06-22',
    fixed: [
      'Collapsed all-platform self echoes when a chat source is connected but not currently marked send-capable.',
      'Made /clear clear the local chat feed and saved history instead of sending /clear to platforms.',
      'Added a compact elapsed live-time pill to the top-right chat overlay header.',
    ],
  },
  {
    version: '1.4.16',
    date: '2026-06-22',
    fixed: [
      'Collapsed delayed duplicate all-platform sent-message echoes even when live chat arrives between platform responses.',
      'Changed the rotating chat identity to show only the platform icon and username in the chat line.',
      'Reserved a fixed identity width so rotating between different username lengths does not shift the message text.',
    ],
  },
  {
    version: '1.4.15',
    date: '2026-06-22',
    added: [
      'Added Settings access to the in-app changelog.',
      "Added a launch changelog popup with a don't-show-again option for the current version.",
    ],
    fixed: [
      'Combined duplicate all-platform sent-message echoes into one rotating chat identity row.',
      'Kept the chat composer target label as All Platforms while preserving the destination tooltip.',
    ],
  },
  {
    version: '1.4.14',
    date: '2026-06-22',
    added: ['Added CHANGELOG.md so release notes can be tracked per version going forward.'],
    fixed: [
      'Restored the chat composer target selector so Send to: shows All Platforms when posting to every connected send target.',
      'Kept the all-platform target tooltip with the per-platform destination list.',
      'Fixed the chat composer so any send-capable connected platform can enable sending, not only Twitch.',
      'Removed a broken rotating target overlay from the composer.',
    ],
  },
  {
    version: '1.4.13',
    date: '2026-06-22',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.13.exe.',
      'Website release copy pointed to the 1.4.13 installer.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.12',
    date: '2026-06-22',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.12.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.11',
    date: '2026-06-22',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.11.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.10',
    date: '2026-06-22',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.10.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.9',
    date: '2026-06-22',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.9.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.8',
    date: '2026-06-20',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.8.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.7',
    date: '2026-06-18',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.7.exe.',
      'Build logs show the signed bundled OBS runtime and vaultstudio-engine.exe were included in the package.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.6',
    date: '2026-06-18',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.6.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.5',
    date: '2026-06-17',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.5.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.4',
    date: '2026-06-17',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.4.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.3',
    date: '2026-06-16',
    changed: [
      'Reconstructed notes include activity event deduping, follower count wording, native libobs loading, native GPU mirror preview, and Edit Layout background fixes.',
    ],
  },
  {
    version: '1.4.2',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.2.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.1.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.4.0.exe.',
      'Start of the 1.4 installer line.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.9',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.9.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.8',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.8.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.7',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.7.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.6',
    date: '2026-06-15',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.6.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.5',
    date: '2026-06-14',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.5.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.4',
    date: '2026-06-14',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.4.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.2',
    date: '2026-06-14',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.2.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.1',
    date: '2026-06-14',
    changed: [
      'Packaged Windows installer: release/VaultStudio Setup 1.3.1.exe.',
      'Detailed notes were not recorded before the changelog existed.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-06-13',
    changed: [
      'Release plan targeted built-in phone RTMP ingest, BRB recovery, Pro licensing UX, free-tier wording, standalone Windows packaging, and website release copy.',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-12',
    changed: [
      'First packaged Windows installer with Electron, React, studio panels, unified chat, session stats, scenes, sources, audio UI, platform badges, splash startup, and Pro key foundations.',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-11',
    changed: [
      'Initial development baseline in package.json.',
      'Scaffolded the Electron, React, and Vite project plus the MVP studio UI from the design plan.',
    ],
  },
];
