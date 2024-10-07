import React from "react";
import axios from "axios";
import {ToastContainer, toast } from "react-toastify";
import { useNavigate, useLocation, Link } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { all_routes } from "../../Router/all_routes";
import { Copyright } from "../../core/Copy/Copyright";

const EmailVerification = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const route = all_routes;

  // Extrae el correo encriptado desde la URL
  const queryParams = new URLSearchParams(location.search);
  const emailEncriptado = queryParams.get("emailEncriptado");

  const handleResendEmail = async () => {

    try {
      if (!emailEncriptado) {
        toast.error("Correo no encontrado en la URL");
        return;
      }
      const formData = new FormData();
      formData.append('Correo', emailEncriptado);
      // Configura la solicitud al endpoint de reenvío de correo

      const response = await axios.post(
        "https://cheveposapi.codelabs.com.mx/Endpoints/auth/resend_verification.php",
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...formData.getHeaders && formData.getHeaders(),  // Esto es por si `getHeaders` existe
          }
        }
      );

      if (response.data.success) {
        toast.success("Correo reenviado exitosamente");
        navigate(route.signin);
      } else {
        toast.error("No se pudo reenviar el correo");
      }
    } catch (error) {
      toast.error("Error al procesar la solicitud");
    }
  };

  return (
    <div className="main-wrapper">
         <ToastContainer />
      <div className="account-content">
        <div className="login-wrapper email-veri-wrap bg-img">
          <div className="login-content">
            <div className="login-userset">
              <div className="login-logo logo-normal">
                <ImageWithBasePath src="assets/img/logo.png" alt="img" />
              </div>
              <div className="login-logo logo-white">
                <ImageWithBasePath src="assets/img/logo-white.png" alt />
              </div>
              <div className="login-userheading text-center">
                <h3>Verifica Tu Correo</h3>
                <h4 className="verfy-mail-content">
                  Te hemos enviado un correo electronico, por favor sigue las
                  instrucciones del mismo.
                </h4>
              </div>
              <div className="signinform text-center">
                <h4>
                  ¿No has recibido el correo?{" "}
                  <button
                    type="button"
                    className="hover-a resend"
                    onClick={handleResendEmail}
                  >
                    Reenviar correo
                  </button>
                </h4>
              </div>
              <div className="form-login">
                <Link className="btn btn-login" to={all_routes.home}>
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
