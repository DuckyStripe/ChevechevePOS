import React, { useState } from "react";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import { Link } from "react-router-dom";
import { all_routes } from "../../Router/all_routes";
import { loginSimulation } from "../../Data/login"; // Importamos la función de login
import { Copyright } from "../../core/Copy/Copyright";
import "react-toastify/dist/ReactToastify.css";
import { toast, ToastContainer } from "react-toastify";
import Cookies from "js-cookie";

const Signin = () => {
  const [isPasswordVisible, setPasswordVisible] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const handleCheckboxChange = (event) => {
    setRememberMe(event.target.checked);
  };

  const togglePasswordVisibility = () => {
    setPasswordVisible((prevState) => !prevState);
  };
  const handleLogin = async (e) => {
    e.preventDefault();
    setError(""); // Limpiar cualquier error previo

    try {
      if (username.trim() === "" || password.trim() === "") {
        toast.error("Por favor, completa todos los campos", {
          position: "top-right",
          autoClose: 2000
        });
        return;
      }

      const response = await loginSimulation(username, password);


      if (response.success) {
        // Decide el tiempo de expiración de la cookie basado en el estado de "rememberMe"
        const expirationDays = rememberMe ? 7 : 1;
        // Almacenar el token en una cookie
        Cookies.set("authToken", response.data.token, {
          expires: expirationDays,
          path: "/",
          secure: true,
          sameSite: "Strict"
        });
        // Redirigir al dashboard después del login exitoso
        window.location.href = all_routes.dashboard;
      } else {
        // Manejar la respuesta de error
        toast.error(response.message, {
          position: "top-right",
          autoClose: 5000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
          progress: undefined,
          theme: "light"
        });
      }
    } catch (err) {
      console.error("Error en la autenticación", err);
      toast.error("Error de conexión", {
        position: "top-right",
        autoClose: 2000
      });
    }
  };

  const route = all_routes;
  return (
    <div className="main-wrapper">
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
      <div className="account-content">
        <div className="login-wrapper bg-img">
          <div className="login-content">
            <form onSubmit={handleLogin}>
              <div className="login-userset">
                <div className="login-logo logo-normal">
                  <ImageWithBasePath src="assets/img/logo1.png" alt="img" />
                  <h3>CHEVE-POS</h3>
                </div>
                <div className="login-logo logo-white">
                  <ImageWithBasePath src="assets/img/logo-white1.png" alt="" />
                  <h3>CHEVE-POS</h3>
                </div>
                <div className="login-userheading">
                  <h3>Ingresar</h3>
                  <h4>Ingresa al sistema con tu usuario y contraseña.</h4>
                </div>
                {error && <div className="alert alert-danger">{error}</div>}{" "}
                {/* Mostrar error si existe */}
                <div className="form-login mb-3">
                  <label className="form-label">Usuario</label>
                  <div className="form-addons">
                    <input
                      type="text"
                      className="form-control"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                    <ImageWithBasePath
                      src="assets/img/icons/mail.svg"
                      alt="img"
                    />
                  </div>
                </div>
                <div className="form-login mb-3">
                  <label className="form-label">Contaseña</label>
                  <div className="pass-group">
                    <input
                      type={isPasswordVisible ? "text" : "password"}
                      className="pass-input form-control"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <span
                      className={`fas toggle-password ${
                        isPasswordVisible ? "fa-eye" : "fa-eye-slash"
                      }`}
                      onClick={togglePasswordVisibility}
                    ></span>
                  </div>
                </div>
                <div className="form-login authentication-check">
                  <div className="row">
                    <div className="col-12 d-flex align-items-center justify-content-between">
                      <div className="custom-control custom-checkbox">
                        <label className="checkboxs ps-4 mb-0 pb-0 line-height-1">
                          <input
                            type="checkbox"
                            className="form-control"
                            checked={rememberMe}
                            onChange={handleCheckboxChange}
                          />
                          <span className="checkmarks" />
                          Recuerdame
                        </label>
                      </div>
                      <div className="text-end">
                        <Link className="forgot-link" to={route.forgotPassword}>
                          ¿Olvidaste tu contraseña?
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="form-login">
                  <button type="submit" className="btn btn-login">
                    Ingresar
                  </button>
                </div>
                <div className="form-sociallink">
                  <div className="my-4 d-flex justify-content-center align-items-center copyright-text">
                    <p>{Copyright.copy}</p>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signin;
