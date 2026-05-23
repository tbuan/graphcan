import { NavLink } from 'react-router-dom'

const TABS = [
  { path: '/table',    label: 'Table'    },
  { path: '/chart',    label: 'Chart'    },
  { path: '/analysis', label: 'Analysis' },
]

function NavTabs() {
  return (
    <nav className="nav-tabs">
      {TABS.map(tab => (
        <NavLink
          key={tab.path}
          to={tab.path}
          className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default NavTabs
