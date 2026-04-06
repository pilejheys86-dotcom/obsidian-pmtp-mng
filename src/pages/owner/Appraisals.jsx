import { useAuth } from '../../context'
import AppraiserWorkspace from './appraisals/AppraiserWorkspace'
import ManagerWorkspace from './appraisals/ManagerWorkspace'
import CashierWorkspace from './appraisals/CashierWorkspace'
import OwnerWorkspace from './appraisals/OwnerWorkspace'

export default function Appraisals() {
  const { profile } = useAuth()
  const role = profile?.role

  switch (role) {
    case 'APPRAISER':
      return <AppraiserWorkspace />
    case 'MANAGER':
      return <ManagerWorkspace />
    case 'CASHIER':
      return <CashierWorkspace />
    case 'OWNER':
    default:
      return <OwnerWorkspace />
  }
}
