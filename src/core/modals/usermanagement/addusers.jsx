import React, { useState, useEffect } from "react";
import Select from "react-select";
import { fetchRolesAvaible } from "../../../Data/Inventario/users";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const AddUsers = () => {
  const [roles, setRoles] = useState([]);
  const [formData, setFormData] = useState({
    username: "",
    user: "",
    phone: "",
    email: "",
    role: null,
    password: "",
    confirmPassword: ""
  });

  const [formErrors, setFormErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setConfirmPassword] = useState(false);

  useEffect(() => {
    const initializeData = async () => {
      const users = await fetchRolesAvaible();
      setRoles(users);
    };
    initializeData();
  }, []);
  const resetFormData = () => {
    setFormData({
      username: "",
      user: "",
      phone: "",
      email: "",
      role: null,
      password: "",
      confirmPassword: ""
    });
    setFormErrors({});
  };
  const handleTogglePassword = () => {
    setShowPassword((prevShowPassword) => !prevShowPassword);
  };

  const handleToggleConfirmPassword = () => {
    setConfirmPassword((prevShowPassword) => !prevShowPassword);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };

  const handleRoleChange = (selectedOption) => {
    setFormData({
      ...formData,
      role: selectedOption.value // Guarda solo el valor del rol
    });
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.username) {
      errors.username = "El nombre es obligatorio";
    }

    if (!formData.user) {
      errors.user = "El usuario es obligatorio";
    }

    if (!formData.phone) {
      errors.phone = "El teléfono es obligatorio";
    }

    if (!formData.email) {
      errors.email = "El correo es obligatorio";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = "El correo no es válido";
    }

    if (!formData.role || formData.role === 'Elegir Uno') {
      errors.role = "El rol es obligatorio";
    }

    if (!formData.password) {
      errors.password = "La contraseña es obligatoria";
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Las contraseñas no coinciden";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        // Simula un fetch
        // Simula una respuesta exitosa con una notificación
        toast.success("Usuario agregado exitosamente");

        // Descomenta y ajusta la solicitud API real
        // await fetch('your-endpoint-url', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify(formData),
        // });

      } catch (error) {
        console.error("Error al enviar datos: ", error);
        // Mostrar notificación de error
        toast.error("Error al agregar el usuario");
      }
    }
  };


  return (
      <div>
    <ToastContainer />
      {/* Add User */}
      <div className="modal fade" id="add-units">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir Usuario</h4>
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
                  <form onSubmit={handleSubmit}>
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="input-blocks">
                          <label>Nombre del usuario</label>
                          <input
                            type="text"
                            name="username"
                            value={formData.username}
                            onChange={handleInputChange}
                            className="form-control"
                          />
                          {formErrors.username && (
                            <span className="text-danger">
                              {formErrors.username}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Usuario</label>
                          <input
                            type="text"
                            name="user"
                            value={formData.user}
                            onChange={handleInputChange}
                            className="form-control"
                          />
                          {formErrors.user && (
                            <span className="text-danger">
                              {formErrors.user}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Número Telefónico</label>
                          <input
                            type="text"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            className="form-control"
                          />
                          {formErrors.phone && (
                            <span className="text-danger">
                              {formErrors.phone}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Correo</label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            className="form-control"
                          />
                          {formErrors.email && (
                            <span className="text-danger">
                              {formErrors.email}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Rol</label>

                          <Select
                            classNamePrefix="react-select"
                            options={roles}
                            placeholder="Elegir rol"
                            value={
                              roles.find(
                                (role) => role.value === formData.role
                              ) || null
                            } // Ajustar para que coincida
                            onChange={handleRoleChange}
                          />

                          {formErrors.role && (
                            <span className="text-danger">
                              {formErrors.role}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-lg-6">
                        <div className="input-blocks">
                          <label>Contraseña</label>
                          <div className="pass-group">
                            <input
                              type={showPassword ? "text" : "password"}
                              name="password"
                              value={formData.password}
                              onChange={handleInputChange}
                              className="pass-input"
                            />
                            <span
                              className={`fas toggle-password ${
                                showPassword ? "fa-eye" : "fa-eye-slash"
                              }`}
                              onClick={handleTogglePassword}
                            />
                            {formErrors.password && (
                              <span className="text-danger">
                                {formErrors.password}
                              </span>
                            )}
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
                              value={formData.confirmPassword}
                              onChange={handleInputChange}
                              className="pass-input"
                            />
                            <span
                              className={`fas toggle-password ${
                                showConfirmPassword ? "fa-eye" : "fa-eye-slash"
                              }`}
                              onClick={handleToggleConfirmPassword}
                            />
                            {formErrors.confirmPassword && (
                              <span className="text-danger">
                                {formErrors.confirmPassword}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={resetFormData}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-submit">
                        Guardar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Add User */}
    </div>
  );
};

export default AddUsers;
