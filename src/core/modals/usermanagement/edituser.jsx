import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import PropTypes from "prop-types";
import { fetchRolesAvaible } from "../../../Data/Inventario/users";
import { ToastContainer, toast } from "react-toastify";
import 'react-toastify/dist/ReactToastify.css';
import {encriptarContrasena} from "../../../Data/DataEncrypt";
import axios from "axios";
import Cookies from "js-cookie";
const EditUser = ({ UserData }) => {
  const [Roles, setRoles] = useState([]);
  const [Datauser, setDatauser] = useState({});
  const [showPassword, setShowPassword] = useState(true);
  const [showConfirmPassword, setConfirmPassword] = useState(true);
  const [estatus, setEstatus] = useState(true);
  useEffect(() => {
    const initializeData = async () => {
      // Make sure to fetch roles
      const roles = await fetchRolesAvaible();
      setRoles(roles);

      // Set user data only if defined
      if (UserData) {
        setEstatus(UserData.estado === 1); // Corrige la asignación inicial de estatus
        setDatauser(UserData);
      }
    };
    initializeData();
  }, [UserData]);
  useEffect(() => {
    console.log("Nuevo Proucto:",Datauser)
  }, [Datauser]);
  const handleTogglePassword = () => {
    setShowPassword((prevShowPassword) => !prevShowPassword);
  };

  const handleToggleConfirmPassword = () => {
    setConfirmPassword((prevShowPassword) => !prevShowPassword);
  };
  const validateFormData = () => {
    const errors = {};

    // Validación para el teléfono
    if (!Datauser.telefono) {
        errors.telefono = "El teléfono es requerido.";
    } else if (!/^\d{10}$/.test(Datauser.telefono)) {
        errors.telefono = "El teléfono debe contener 10 dígitos.";
    }

    // Validación para el correo
    if (!Datauser.correo) {
        errors.correo = "El correo es requerido.";
    } else if (!/\S+@\S+\.\S+/.test(Datauser.correo)) {
        errors.correo = "El correo debe ser una dirección válida.";
    }

    // Validación para el rol
    if (!Datauser.nombre_rol) {
        errors.nombre_rol = "El rol es requerido.";
    }

    // Validación para la contraseña (si se proporciona)
    if (Datauser.password && Datauser.password.length < 6) {
        errors.password = "La contraseña debe tener al menos 6 caracteres.";
    }

    // Validación para la confirmación de contraseña
    if (Datauser.password && Datauser.confirmPassword !== Datauser.password) {
        errors.confirmPassword = "Las contraseñas no coinciden.";
    }

    return errors;
};

const handlesubmit = async () => {
  const errors = validateFormData();

  if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
          toast.error(error);
      });
      return;
  }

  if (Datauser.password !== Datauser.confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
  }

  delete Datauser.confirmPassword;

  // Determina si la contraseña se debe incluir
  let passwordToSend = null;
  if (Datauser.password) {
      const { contrasena_encriptada } = encriptarContrasena(Datauser.password);
      passwordToSend = contrasena_encriptada;
  }

  const token = Cookies.get("authToken");

  const formData = new FormData();
  formData.append("userId", Datauser.id);
  formData.append("rol_id", Datauser.rol_id);
  formData.append("correo", Datauser.correo);
  formData.append("telefono", Datauser.telefono);
  if (passwordToSend) {
      formData.append("password", passwordToSend);
  } // Solo se agrega si se ha ingresado una nueva contraseña
  formData.append("estado", Datauser.estado);

  const config = {
      method: "post",
      url: "https://cheveposapi.codelabs.com.mx/Endpoints/Update/UpdateUser.php",
      headers: {
          Authorization: `Bearer ${token}`,
      },
      data: formData,
  };

  try {
      const response = await axios.request(config);

      if (response.data.success) {
          toast.success("Usuario actualizado correctamente.");
          // Limpiar o redirigir según sea necesario
          window.location.reload();
      } else {
          toast.error(`Error: ${response.data.message}`);
      }
  } catch (error) {
      toast.error(`Error: ${error.message}`);
  }
};


  const handledeleteData = () => {
    setDatauser({}); // Correcto para reiniciar el objeto de datos del usuario
    setShowPassword(true); // Restablecer a valor booleano
    setConfirmPassword(true); // Restablecer a valor booleano
  };
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setDatauser((prevData) => ({
      ...prevData,
      [name]: value
    }));
  };
  const handleRoleChange = (selectedOption) => {
    setDatauser((prevData) => ({
      ...prevData,
      rol_id: selectedOption ? selectedOption.value : ""
    }));
  };
  return (
    <div>
      <ToastContainer/>
      {/* Edit User */}
      <div className="modal fade" id="edit-units">
      <ToastContainer/>
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Usuario</h4>
                  </div>
                  <button
                    type="button"
                    className="close"
                    data-bs-dismiss="modal"
                    aria-label="Close"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="modal-body custom-modal-body">
                  <form>
                    <div className="row">
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Usuario</label>
                          <input
                            type="text"
                            name="usuario"
                            value={Datauser.usuario || ""}
                            onChange={handleInputChange}
                            disabled={true}
                          />
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Teléfono</label>
                          <input
                            type="text"
                            name="telefono"
                            value={Datauser.telefono || ""}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Correo</label>
                          <input
                            type="email"
                            name="correo"
                            value={Datauser.correo || ""}
                            onChange={handleInputChange}
                          />
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                        <label>Rol</label>
                          <Select
                            classNamePrefix="react-select"
                            options={Roles}
                            value={Roles.find(
                              (role) => role.value === Datauser.rol_id
                            )} // Usar 'value' en lugar de 'defaultValue'
                            onChange={handleRoleChange}
                            placeholder="Elige un rol"
                          />
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Contraseña</label>
                          <div className="pass-group">
                            <input
                              type={showPassword ? "text" : "password"}
                              name="password"
                              className="pass-input"
                              placeholder="**********"
                              onChange={handleInputChange}
                            />

                            <span
                              className={`fas toggle-password ${
                                showPassword ? "fa-eye" : "fa-eye-slash"
                              }`}
                              onClick={handleTogglePassword}
                            />
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Confirmar Contraseña</label>
                          <div className="pass-group">
                            <input
                              type={showConfirmPassword ? "text" : "password"}
                              name="confirmPassword"
                              className="pass-input"
                              placeholder="*********"
                              onChange={handleInputChange}
                            />

                            <span
                              className={`fas toggle-password ${
                                showConfirmPassword ? "fa-eye" : "fa-eye-slash"
                              }`}
                              onClick={handleToggleConfirmPassword}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="mb-0">
                      <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                        <span className="status-label">Estatus</span>
                        <input
                          type="checkbox"
                          id="status"
                          className="check"
                          checked={estatus}
                          onChange={(e) => {
                            const newStatus = e.target.checked;
                            setEstatus(newStatus);

                            // Actualizar también en Datauser
                            setDatauser((prevData) => ({
                              ...prevData,
                              estado: newStatus ? 1 : 0 // Actualiza 'estado' según el checkbox
                            }));
                          }}
                        />

                        <label htmlFor="status" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={handledeleteData}
                      >
                        Cancelar
                      </button>
                      <Link
                        to="#"
                        className="btn btn-submit"
                        onClick={handlesubmit}
                      >
                        Guardar
                      </Link>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Edit User */}
    </div>
  );
};

EditUser.propTypes = {
  UserData: PropTypes.shape({
    id: PropTypes.number.isRequired,
    nombre_usuario: PropTypes.string.isRequired,
    usuario: PropTypes.string.isRequired,
    telefono: PropTypes.string.isRequired,
    correo: PropTypes.string.isRequired,
    nombre_rol: PropTypes.string.isRequired,
    rol_id: PropTypes.number.isRequired,
    estado: PropTypes.number.isRequired
  })
};

export default EditUser;
