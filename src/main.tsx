import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import App from './App'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import LogNewJobPage from './pages/LogNewJobPage'
import JobsPage from './pages/JobsPage'
import LineagePage from './pages/LineagePage'
import './globals.css'
import AddRawFramePage from './pages/AddRawFramePage'

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: "login",
        element: <LoginPage />,
      },
      {
        path: "jobs/new",
        element: <LogNewJobPage />,
      },
      {
        path: "jobs",
        element: <JobsPage />,
      },
      {
        path: "lineage",
        element: <LineagePage />,
      },
      {
        path: "add-raw-frame",
        element: <AddRawFramePage />,
      }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
