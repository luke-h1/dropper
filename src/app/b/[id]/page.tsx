import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { renderSVG } from 'uqr';

import { Locked } from '@/components/locked';
import { PlatformBadge } from '@/components/platform-badge';
import { requireSession } from '@/lib/auth';
import { getBuild } from '@/lib/builds';
import { signInstallLink } from '@/lib/crypto';
import { formatBytes, formatRelative, isPast } from '@/lib/format';

export const metadata: Metadata = { title: 'Build' };

const INSTALLABLE_IOS = new Set(['ad-hoc', 'development', 'enterprise']);

export default async function BuildPage({
  params,
  searchParams,
}: PageProps<'/b/[id]'>) {
  const { id } = await params;

  if (!(await requireSession(`/b/${id}`, (await searchParams).key))) {
    return <Locked />;
  }

  const build = await getBuild(id);

  if (!build) {
    notFound();
  }

  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host');

  const proto =
    h.get('x-forwarded-proto') ??
    (host?.startsWith('localhost') ? 'http' : 'https');

  const base = `${proto}://${host}`;
  const pageUrl = `${base}/b/${build.id}?key=${encodeURIComponent(process.env.API_KEY)}`;
  const downloadUrl = `/api/builds/${build.id}/download`;
  let installUrl = downloadUrl;

  if (build.platform === 'ios') {
    const { exp, sig } = await signInstallLink(
      process.env.API_KEY,
      build.id,
      60 * 60,
    );

    const manifestUrl = `${base}/api/builds/${build.id}/manifest/${exp}/${sig}/manifest.plist`;
    installUrl = `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`;
  }

  const warnings: string[] = [];

  if (
    build.platform === 'ios' &&
    build.distribution &&
    !INSTALLABLE_IOS.has(build.distribution)
  ) {
    warnings.push(
      `This build is signed for ${build.distribution} distribution, so iOS will refuse to install it from here. Use an EAS profile with "distribution": "internal".`,
    );
  }

  if (build.profileExpiresAt && isPast(build.profileExpiresAt)) {
    warnings.push('The provisioning profile in this build has expired.');
  }

  const details: [string, string | undefined][] = [
    ['Bundle ID', build.bundleId],
    ['Version', `${build.version} (${build.buildNumber})`],
    ['Profile', build.profile],
    ['Channel', build.channel],
    ['Distribution', build.distribution],
    ['Branch', build.gitBranch],
    ['Commit', build.gitCommit?.slice(0, 12)],
    ['Size', formatBytes(build.size)],
    ['Uploaded', `${build.uploadedAt.slice(0, 16).replace('T', ' ')} UTC`],
  ];

  return (
    <main className='grid gap-6'>
      <section className='rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900'>
        <div className='flex items-center gap-2'>
          <h1 className='truncate text-xl font-semibold tracking-tight'>
            {build.name}
          </h1>
          <PlatformBadge platform={build.platform} />
        </div>
        <p className='mt-1 text-sm text-neutral-500'>
          {build.version} ({build.buildNumber}) ·{' '}
          {formatRelative(build.uploadedAt)}
        </p>

        {warnings.map((warning) => (
          <p
            key={warning}
            className='mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
          >
            {warning}
          </p>
        ))}

        <div className='mt-5 flex flex-wrap gap-2'>
          <a
            href={installUrl}
            className='rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200'
          >
            Install
          </a>
          {build.platform === 'ios' && (
            <a
              href={downloadUrl}
              className='rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800'
            >
              Download .ipa
            </a>
          )}
        </div>
        {build.notes && (
          <p className='mt-5 whitespace-pre-wrap text-sm text-neutral-700 dark:text-neutral-300'>
            {build.notes}
          </p>
        )}
      </section>

      <div className='grid gap-6 sm:grid-cols-[1fr_auto]'>
        <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl border border-neutral-200 bg-white p-5 text-sm dark:border-neutral-800 dark:bg-neutral-900'>
          {details.flatMap(([label, value]) =>
            value
              ? [
                  <div key={label} className='contents'>
                    <dt className='text-neutral-500'>{label}</dt>
                    <dd className='truncate font-mono text-xs leading-5'>
                      {value}
                    </dd>
                  </div>,
                ]
              : [],
          )}
        </dl>
        <figure className='hidden flex-col items-center gap-2 rounded-xl border border-neutral-200 bg-white p-5 sm:flex dark:border-neutral-800'>
          <img
            className='size-40'
            alt='QR code for this build page'
            src={`data:image/svg+xml,${encodeURIComponent(renderSVG(pageUrl, { border: 1 }))}`}
          />
          <figcaption className='text-xs text-neutral-500'>
            Scan to open on your phone
          </figcaption>
        </figure>
      </div>
    </main>
  );
}
