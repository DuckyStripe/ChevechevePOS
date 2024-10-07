import React, { useState } from "react";
import axios from 'axios';
import FormData from 'form-data';
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";  // Importa useHistory
import { all_routes } from "../../Router/all_routes";
import { Copyright } from "../../core/Copy/Copyright";
import { encriptarContrasena } from '../../Data/DataEncrypt';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useNavigate } from 'react-router-dom';
const Forgotpassword = () => {
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    const { contrasena_encriptada: emailEncriptado } = encriptarContrasena(email);

    let data = new FormData();
    data.append('Correo', emailEncriptado);

    try {
      const config = {
        method: 'post',
        url: 'https://cheveposapi.codelabs.com.mx/Endpoints/auth/forgotpass.php',
        data: data,
      };

      const response = await axios.request(config);

      if (response.data.success) {
        toast.success("Correo enviado con éxito");
        navigate(`${all_routes.emailverification}?emailEncriptado=${encodeURIComponent(emailEncriptado)}`);
      } else {
        toast.error("No se pudo encontrar el correo proporcionado");
      }

    } catch (error) {
      toast.error("Error al procesar la solicitud");
    }
  }

  const route = all_routes;

  return (
    <div className="main-wrapper">
      <div className="account-content">
        <div className="login-wrapper forgot-pass-wrap bg-img">
          <div className="login-content">
            <form onSubmit={handleSubmit}>
              <div className="login-userset">
                <div className="login-logo logo-normal">
                  <ImageWithBasePath src="assets/img/logo.png" alt="img" />
                </div>
                <div className="login-logo logo-white">
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
                    <input
                      type="email"
                      className="form-control"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <ImageWithBasePath src="assets/img/icons/mail.svg" alt="img" />
                  </div>
                </div>
                <div className="form-login">
                  <button type="submit" className="btn btn-login">
                    Enviar
                  </button>
                </div>
                <div className="signinform text-center">
                  <h4>
                    Regresar a
                    <Link to={route.signin} className="hover-a">
                      {" "}Iniciar Sesión{" "}
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
      <ToastContainer />
    </div>
  );
};

export default Forgotpassword;
