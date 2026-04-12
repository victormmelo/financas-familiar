import '../src/env'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const family = await prisma.family.upsert({
    where: { id: 'seed-family-id' },
    update: {},
    create: {
      id: 'seed-family-id',
      name: 'Família Silva',
    },
  })

  // Default categories
  const categories = [
    { name: 'Moradia', type: 'EXPENSE' as const, icon: '🏠', color: '#4A90E2' },
    { name: 'Alimentação', type: 'EXPENSE' as const, icon: '🍔', color: '#E27D4A' },
    { name: 'Transporte', type: 'EXPENSE' as const, icon: '🚗', color: '#4AE2A0' },
    { name: 'Saúde', type: 'EXPENSE' as const, icon: '💊', color: '#E24A7D' },
    { name: 'Educação', type: 'EXPENSE' as const, icon: '📚', color: '#A04AE2' },
    { name: 'Lazer', type: 'EXPENSE' as const, icon: '🎮', color: '#E2C94A' },
    { name: 'Salário', type: 'INCOME' as const, icon: '💰', color: '#4AE24A' },
    { name: 'Freelance', type: 'INCOME' as const, icon: '💻', color: '#4AE2E2' },
    { name: 'Investimentos', type: 'BOTH' as const, icon: '📈', color: '#7D4AE2' },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: {
        id: `seed-cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`,
      },
      update: {},
      create: {
        id: `seed-cat-${cat.name.toLowerCase().replace(/\s/g, '-')}`,
        familyId: family.id,
        name: cat.name,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
      },
    })
  }

  // Default account
  await prisma.account.upsert({
    where: { id: 'seed-account-main' },
    update: {},
    create: {
      id: 'seed-account-main',
      familyId: family.id,
      name: 'Conta Corrente',
      type: 'CHECKING',
      initialBalance: 5000,
      color: '#4A90E2',
      icon: '🏦',
    },
  })

  console.log(`✅ Seed complete!`)
  console.log(`   Family: ${family.name} (${family.id})`)
  console.log('   Autenticação: Keycloak + POST /auth/bootstrap para criar o primeiro usuário ADMIN.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
