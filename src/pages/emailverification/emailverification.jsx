import React from "react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";
import { Copyright } from "../../core/Copy/Copyright";

const EmailVerification = () => {
  const route = all_routes;
  return (
    <div className="main-wrapper">
      <div className="account-content">
        <div className="login-wrapper email-veri-wrap bg-img">
          <div className="login-content">
            <div className="login-userset">
              <div className="login-userset">
                <div className="login-logo logo-normal">
                  <ImageWithBasePath src="assets/img/logo.png" alt="img" />
                </div>
              </div>
              <div className="login-logo logo-white">
                <ImageWithBasePath src="assets/img/logo-white.png" alt />
              </div>
              <div className="login-userheading text-center">
                <h3>Verifica Tu Correo</h3>
                <h4 className="verfy-mail-content">
                  Te hemos enviado un correo electronico, por favor sigue las instrucciones del mismo.
                </h4>
              </div>
              <div className="signinform text-center">
                <h4>
                  ¿No haz recibido el correo?{" "}
                  <Link to="#" className="hover-a resend">
                    Reenviar correo
                  </Link>
                </h4>
              </div>
              <div className="form-login">
                <Link className="btn btn-login" to={route.home}>
                  Regresar
                </Link>
              </div>
              <div className="my-4 d-flex justify-content-center align-items-center copyright-text">
                <p>{Copyright.copy}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EmailVerification;
