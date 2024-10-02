import React from "react";
import { Route, Navigate } from "react-router-dom";
import Signin from "../pages/login/signin";
import Pos from "../pages/pos/pos";
import Error404 from "../pages/errorpages/error404";
import Error500 from "../pages/errorpages/error500";
import Forgotpassword from "../pages/forgotpassword/forgotpassword";
import Resetpassword from "../pages/resetpassword/resetpassword";
import EmailVerification from "../pages/emailverification/emailverification";
import Dashboard from "../pages/dashboard/Dashboard";
import AddProduct from "../admin/inventory/addproduct";
import ProductList from "../admin/inventory/productlist";
import ExpiredProduct from "../admin/inventory/expiredproduct";
import LowStock from "../admin/inventory/lowstock";
import CategoryList from "../admin/inventory/categorylist";
import SubCategories from "../admin/inventory/subcategories";
import PurchasesList from "../admin/Sales/purchaseslist";
import Customers from "../admin/customers";
import SalesReport from "../admin/Sales/salesreport";
import PurchaseReport from "../admin/Sales/purchasereport";
import ProfitLoss from "../admin/Sales/profitloss";
import SalesList from "../admin/Sales/saleslist";
import Users from "../admin/users";
import RolesPermissions from "../admin/rolespermissions";
import EditProduct from "../admin/inventory/editproduct";

const routes = all_routes;
import { all_routes } from "./all_routes";
export const publicRoutes = [
  {
    id: 1,
    path: routes.dashboard,
    name: "home",
    element: <Dashboard />,
    route: Route
  },
  {
    id: 2,
    path: routes.productlist,
    name: "products",
    element: <ProductList />,
    route: Route
  },
  {
    id: 3,
    path: routes.addproduct,
    name: "products",
    element: <AddProduct />,
    route: Route
  },
  {
    id: 117,
    path: "/",
    name: "Root",
    element: <Navigate to="/signin" />,
    route: Route
  },
  {
    id: 65,
    path: routes.editproduct,
    name: "editproduct",
    element: <EditProduct />,
    route: Route
  },
  {
    id: 99,
    path: routes.pos,
    name: "pos",
    element: <Pos />,
    route: Route
  },
  {
    id: 58,
    path: routes.expiredproduct,
    name: "expiredproduct",
    element: <ExpiredProduct />,
    route: Route
  },
  {
    id: 59,
    path: routes.lowstock,
    name: "lowstock",
    element: <LowStock />,
    route: Route
  },
  {
    id: 60,
    path: routes.categorylist,
    name: "categorylist",
    element: <CategoryList />,
    route: Route
  },
  {
    id: 64,
    path: routes.subcategories,
    name: "subcategories",
    element: <SubCategories />,
    route: Route
  },
  {
    id: 68,
    path: routes.purchaselist,
    name: "purchaselist",
    element: <PurchasesList />,
    route: Route
  },
  {
    id: 84,
    path: routes.customers,
    name: "customers",
    element: <Customers />,
    route: Route
  },
  {
    id: 90,
    path: routes.salesreport,
    name: "salesreport",
    element: <SalesReport />,
    route: Route
  },
  {
    id: 91,
    path: routes.purchasereport,
    name: "purchasereport",
    element: <PurchaseReport />,
    route: Route
  },
  {
    id: 99,
    path: routes.profitloss,
    name: "profitloss",
    element: <ProfitLoss />,
    route: Route
  },
  {
    id: 102,
    path: routes.saleslist,
    name: "saleslist",
    element: <SalesList />,
    route: Route
  },
  {
    id: 104,
    path: routes.users,
    name: "users",
    element: <Users />,
    route: Route
  },
  {
    id: 105,
    path: routes.rolespermission,
    name: "rolespermission",
    element: <RolesPermissions />,
    route: Route
  }
];

export const pagesRoute = [
  {
    id: 1,
    path: routes.signin,
    name: "signin",
    element: <Signin />,
    route: Route
  },
  {
    id: 7,
    path: routes.forgotPassword,
    name: "forgotPassword",
    element: <Forgotpassword />,
    route: Route
  },
  {
    id: 9,
    path: routes.resetpassword,
    name: "resetpassword",
    element: <Resetpassword />,
    route: Route
  },
  {
    id: 12,
    path: routes.emailverification,
    name: "emailverification",
    element: <EmailVerification />,
    route: Route
  },
  {
    id: 18,
    path: routes.error404,
    name: "error404",
    element: <Error404 />,
    route: Route
  },
  {
    id: 19,
    path: routes.error500,
    name: "error500",
    element: <Error500 />,
    route: Route
  }
];

export const posRoutes = [
  {
    id: 1,
    path: routes.pos,
    name: "pos",
    element: <Pos />,
    route: Route
  }
];
