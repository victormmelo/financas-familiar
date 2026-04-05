export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0B0F0B] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-widest text-[#7CFC98] uppercase">
            Finanças<span className="text-[#E7F0E7]"> Familiar</span>
          </h1>
          <p className="text-xs text-[#7D8A7D] mt-2 uppercase tracking-widest">
            Controle Financeiro Familiar
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
