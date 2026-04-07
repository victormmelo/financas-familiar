import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6 py-4 sm:gap-8 sm:py-6">
      <div className="rounded-md border border-border bg-card px-3 py-3">
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <Skeleton className="h-11 w-11 shrink-0 rounded-sm sm:h-9 sm:w-9" />
          <Skeleton className="h-10 min-w-[12rem] max-w-[14rem] sm:min-w-[14rem]" />
          <Skeleton className="h-11 w-11 shrink-0 rounded-sm sm:h-9 sm:w-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <div className="mb-3 flex items-start justify-between gap-2">
                <Skeleton className="h-4 w-28 flex-1" />
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-36" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
