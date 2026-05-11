import type { Metadata } from 'next'
import { PartDetail } from './PartDetail'

export const metadata: Metadata = {
  title: 'Bauteil-Details — Bauteil-Finder',
}

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params  // Next.js 16: params ist Promise
  return (
    <div className="py-8 px-4">
      <div className="max-w-md mx-auto">
        <PartDetail id={id} />
      </div>
    </div>
  )
}
