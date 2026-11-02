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
import ManageFramesPage from './pages/ManageFramesPage'
import PixelInspector from './pages/PixelInspector'
import ValidationPage from './pages/ValidationPage'

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
        path: "frames",
        element: <ManageFramesPage />,
      },
      {
        path: "add-raw-frame",
        element: <ManageFramesPage initialTab="upload" />,
      },
      {
        path: "inspect/:imageId",
        element: <PixelInspector />,
      },
      {
        path: "validation",
        element: <ValidationPage />,
      }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />
)
