import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/serverAuth'

export default function Home() {
  const session = getServerSession()
  redirect(session ? '/leads' : '/login')
}
