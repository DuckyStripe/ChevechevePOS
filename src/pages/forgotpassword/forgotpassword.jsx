import React from "react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";
import {Copyright} from "../../core/Copy/Copyright";

const Forgotpassword = () => {
  const route = all_routes;
  return (
    <div className="main-wrapper">
      <div className="account-content">
        <div className="login-wrapper forgot-pass-wrap bg-img">
          <div className="login-content">
            <form>
              <div className="login-userset">
                <div className="login-logo logo-normal">
                  <ImageWithBasePath src="assets/img/logo.png" alt="img" />
                </div>
                <div  className="login-logo logo-white">
                  <ImageWithBasePath src="assets/img/logo-white.png" alt />
                </div>
                <div className="login-userheading">
                  <h3>¿Olvidaste tu contraseña?</h3>
                  <h4>
                    Si olvidaste tu contraseña, te enviaremos un correo con instrucciones para reestablecerla.
                  </h4>
                </div>
                <div className="form-login">
                  <label>Correo</label>
                  <div className="form-addons">
                    <input type="email" className="form-control" />
                    <ImageWithBasePath
                      src="assets/img/icons/mail.svg"
                      alt="img"
                    />
                  </div>
                </div>
                <div className="form-login">
                  <Link tp={route.signin} className="btn btn-login">
                    Enviar
                  </Link>
                </div>
                <div className="signinform text-center">
                  <h4>
                    Regresar a
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

export default Forgotpassword;
