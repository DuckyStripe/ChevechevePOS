import React from "react";
import { Route, Navigate } from "react-router-dom";
import Signin from "../pages/login/signin";
import Pos from "../pages/pos/pos";
import Error404 from "../pages/errorpages/error404";
import Error500 from "../pages/errorpages/error500";
import Forgotpassword from "../pages/forgotpassword/forgotpassword";
import Resetpassword from "../pages/resetpassword/resetpassword";
import EmailVerification from "../pages/emailverification/emailverification"
import Dashboard from "../pages/dashboard/Dashboard";

const routes = all_routes;
import { all_routes } from "./all_routes";
export const publicRoutes = [

  {
    id: 117,
    path: '/',
    name: 'Root',
    element: <Navigate to="/signin" />,
    route: Route,
  },
  {
    id: 1,
    path: routes.dashboard,
    name: "home",
    element: <Dashboard />,
    route: Route,
  },
  ]

  export const pagesRoute = [
    {
      id: 1,
      path: routes.signin,
      name: "signin",
      element: <Signin />,
      route: Route,
    },
    {
      id: 7,
      path: routes.forgotPassword,
      name: "forgotPassword",
      element: <Forgotpassword />,
      route: Route,
    },
    {
      id: 9,
      path: routes.resetpassword,
      name: "resetpassword",
      element: <Resetpassword />,
      route: Route,
    },
    {
      id: 12,
      path: routes.emailverification,
      name: "emailverification",
      element: <EmailVerification />,
      route: Route,
    },
    {
      id: 18,
      path: routes.error404,
      name: "error404",
      element: <Error404 />,
      route: Route,
    },  {
      id: 19,
      path: routes.error500,
      name: "error500",
      element: <Error500 />,
      route: Route,
    },
  ]

    export const posRoutes = [
      {
        id: 1,
        path: routes.pos,
        name: "pos",
        element: <Pos />,
        route: Route,
      },
    ];