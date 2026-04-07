import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TransacoesLoading() {
  return (
    <div className="flex flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <div className="rounded-sm border border-border border-l-2 border-l-[#7CFC98] bg-card/80 p-4">
        <Skeleton className="mb-3 h-4 w-36" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 sm:col-span-1 lg:col-span-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-10 w-full rounded-sm md:h-8" />
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold tracking-tight">
            <Skeleton className="h-5 w-32" />
          </CardTitle>
          <Skeleton className="h-10 w-full rounded-sm md:ml-auto md:h-9 md:w-44" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border md:hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-sm" />
                  <Skeleton className="h-11 w-11 shrink-0 rounded-sm" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden divide-y divide-border md:block">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-0">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-4 w-20" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
