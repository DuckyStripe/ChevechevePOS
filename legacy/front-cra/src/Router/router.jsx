import React from "react";
import { Route, Routes } from "react-router-dom";
import Header from "../InitialPage/Sidebar/Header";
import Sidebar from "../InitialPage/Sidebar/Sidebar";
import { pagesRoute, posRoutes, publicRoutes } from "./router.link";
import { Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import ThemeSettings from "../InitialPage/themeSettings";
import Error404 from "../pages/errorpages/error404";
import Loader from "../loader/loader";
import ProtectedRoute from '../core/auth/protectedroute'
import { ToastContainer } from "react-toastify";

const AllRoutes = () => {
  const data = useSelector((state) => state.toggle_header);

  const HeaderLayout = () => (
    <div className={`main-wrapper ${data ? "header-collapse" : ""}`}>
      <Loader />
      <Header />
      <Sidebar />
      <Outlet />
      <ThemeSettings />
    </div>
  );

  const Authpages = () => (
    <div className={data ? "header-collapse" : ""}>
      <Outlet />
      <Loader />
      <ThemeSettings />
    </div>
  );

  const Pospages = () => (
    <div>
      <Loader />
      <Header />
      <Outlet />
      <ThemeSettings />
    </div>
  );

  return (
    <div>
            <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />
      <Routes>
        <Route path="/pos" element={<ProtectedRoute element={<Pospages />} />}>
          {posRoutes.map((route, id) => (
            <Route path={route.path} element={route.element} key={id} />
          ))}
        </Route>
        <Route path="/" element={<ProtectedRoute element={<HeaderLayout/>} />}>
          {publicRoutes.map((route, id) => (
            <Route path={route.path} element={route.element} key={id} />
          ))}
        </Route>
        <Route path="/" element={<Authpages />}>
          {pagesRoute.map((route, id) => (
            <Route path={route.path} element={route.element} key={id} />
          ))}
        </Route>
        <Route path="*" element={<Error404 />} />
      </Routes>
    </div>
  );
};

export default AllRoutes;