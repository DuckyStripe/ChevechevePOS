import React from "react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";

const Error500 = () => {
  const route = all_routes;
  return (
    <div className="main-wrapper">
      <div className="error-box">
        <div className="error-img">
          <ImageWithBasePath
            src="assets/img/authentication/error-500.png"
            className="img-fluid"
            alt="img"
          />
        </div>
        <h3 className="h2 mb-3">Oops, algo salio mal</h3>
        <p>
          Server Error 500. Esperamos poder arreglar el problema a la bevedad, por favor intenta de nuevo mas tarde.
        </p>
        <Link to={route.home} className="btn btn-primary">
          Regresar
        </Link>
      </div>
    </div>
  );
};

export default Error500;
