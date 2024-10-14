import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";
import { Copyright } from "../../core/Copy/Copyright";
import axios from "axios";
import {  toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { encriptarContrasena } from "../../Data/DataEncrypt";

const Resetpassword = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const route = all_routes;

  useEffect(() => {
    // Obtener el código de la URL
    const queryParams = new URLSearchParams(location.search);
    const encodedCode = queryParams.get("code");
    if (encodedCode) {
      // Decodificar el código
      setCodigo(decodeURIComponent(encodedCode));
    }
  }, [location]);

  const toggleShowPassword = () => {
    setShowPassword(!showPassword);
  };

  const toggleShowConfirmPassword = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };
  const handleSubmit = async (event) => {
    event.preventDefault();

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      toast.error(
        "La contraseña debe tener al menos 8 caracteres, incluyendo mayúsculas, minúsculas, números y caracteres especiales."
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }

    try {
      // Crear una instancia de FormData
      const formData = new FormData();
      formData.append('codigo', codigo);
      formData.append('contrasena_nueva', encriptarContrasena(newPassword).contrasena_encriptada);

      const response = await axios.post(
        "https://cheveposapi.codelabs.com.mx/Endpoints/auth/validatelogin.php",
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...formData.getHeaders && formData.getHeaders(),  // Esto es por si `getHeaders` existe
          }
        }
      );

      if (response.data.success) {
        toast.success(response.data.message);
        navigate(route.signin);
      } else {
        toast.error(response.data.message);
      }
    } catch (error) {
      toast.error("Hubo un error al procesar la solicitud");
      console.error(error);
    }
  };


  return (
    <div className="main-wrapper">
      <div className="account-content">
        <div className="login-wrapper reset-pass-wrap bg-img">
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
                  <h3>¿Resetear contraseña?</h3>
                  <h4>Ingresa tu nueva contaseña y confirma despues.</h4>
                </div>
                <div className="form-login">
                  <label>Contraseña nueva:</label>
                  <div className="pass-group">
                    <input
                      type={showPassword ? "text" : "password"}
                      className="pass-inputs"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <span
                      className="fas toggle-passwords fa-eye-slash"
                      onClick={toggleShowPassword}
                    />
                  </div>
                </div>
                <div className="form-login">
                  <label> Confirmar nueva contaseña</label>
                  <div className="pass-group">
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className="pass-inputa"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                    />
                    <span
                      className="fas toggle-passworda fa-eye-slash"
                      onClick={toggleShowConfirmPassword}
                    />
                  </div>
                </div>
                <div className="form-login">
                  <button type="submit" className="btn btn-login">
                    Confirmar
                  </button>
                </div>
                <div className="signinform text-center">
                  <h4>
                    Regresar a{" "}
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
