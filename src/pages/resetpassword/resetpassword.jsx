import React from "react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";
import {Copyright} from "../../core/Copy/Copyright";

const Resetpassword = () => {
  const route = all_routes;
  return (
    <div className="main-wrapper">
      <div className="account-content">
        <div className="login-wrapper reset-pass-wrap bg-img">
          <div className="login-content">
            <form action="success-3">
              <div className="login-userset">
                <div className="login-logo logo-normal">
                  <ImageWithBasePath src="assets/img/logo.png" alt="img" />
                </div>
                <div  className="login-logo logo-white">
                  <ImageWithBasePath src="assets/img/logo-white.png" alt />
                </div>
                <div className="login-userheading">
                  <h3>¿Resetear contraseña?</h3>
                  <h4>
                    Ingresa tu nueva contaseña y confirma despues.
                  </h4>
                </div>
                <div className="form-login">
                  <label>Contraseña nueva:</label>
                  <div className="pass-group">
                    <input type="password" className="pass-inputs" />
                    <span className="fas toggle-passwords fa-eye-slash" />
                  </div>
                </div>
                <div className="form-login">
                  <label> Confirmar nueva contaseña</label>
                  <div className="pass-group">
                    <input type="password" className="pass-inputa" />
                    <span className="fas toggle-passworda fa-eye-slash" />
                  </div>
                </div>
                <div className="form-login">
                  <Link to={route.dashboard} className="btn btn-login">
                    Confimar
                  </Link>
                </div>
                <div className="signinform text-center">
                  <h4>
                    Regresar a {" "}
                    <Link to={route.signin} className="hover-a">
                      {" "}
                      Iniciar Sesión{" "}
                    </Link>
                  </h4>
                </div>
                <div className="my-4 d-flex justify-content-center align-items-center copyright-text">
                  <p>{Copyright.copy}</p>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Resetpassword;
