// components/ProtectedRoute.js
import React, { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated } from "./auth";
import PropTypes from "prop-types"; // Importa prop-types
import { all_routes } from "../../Router/all_routes";
import Loader from "../../loader/loader";
const ProtectedRoute = ({ element }) => {
  const [isAuth, setIsAuth] = useState(null); // Estado para manejar la autenticación

  useEffect(() => {
    const checkAuth = async () => {
      const authenticated = await isAuthenticated();
      setIsAuth(authenticated);
    };
    checkAuth();
  }, []);

  if (isAuth === null) {
    // Puedes mostrar un loader mientras se verifica la autenticación
    return <Loader />;
  }

  if (!isAuth) {
    return <Navigate to={all_routes.signin} />;
  }

  return element;
};

ProtectedRoute.propTypes = {
  element: PropTypes.element.isRequired,
};

export default ProtectedRoute;
