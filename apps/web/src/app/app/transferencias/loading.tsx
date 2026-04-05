import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function TransferenciasLoading() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-44" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-1 p-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-6 py-4 border-b last:border-0">
              <div className="flex items-center gap-2 flex-1">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-24" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
