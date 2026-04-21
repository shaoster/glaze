import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Tab, Tabs } from '@mui/material'

export default function LandingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const currentTab = location.pathname === '/analyze' ? '/analyze' : '/'

  return (
    <>
      <Tabs
        value={currentTab}
        onChange={(_event, nextTab: string) => navigate(nextTab)}
        aria-label="Landing page navigation"
        sx={{ mb: 3 }}
      >
        <Tab label="Pieces" value="/" />
        <Tab label="Analyze" value="/analyze" />
      </Tabs>
      <Outlet />
    </>
  )
}
