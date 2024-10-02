import { DatePicker } from "antd";
import { Calendar } from "feather-icons-react/build/IconComponents";
import React, { useState } from "react";
import { Link } from "react-router-dom";
const AddPurchases = () => {

  const [selectedDate, setSelectedDate] = useState(new Date());
  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  return (
    <div>
      {/* Add Purchase */}
      <div className="modal fade" id="add-units">
        <div className="modal-dialog purchase modal-dialog-centered stock-adjust-modal">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir Compra</h4>
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
                      <div className="col-lg-12">
                        <div className="input-blocks">
                          <label>Nombre del Producto</label>
                          <input
                            type="text"
                            placeholder="Ingresa el nombre del producto"
                          />
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-lg-4 col-md-6 col-sm-12">
                          <div className="input-blocks">
                            <label>Cantidad</label>
                            <input type="text" defaultValue={0} />
                          </div>
                        </div>
                        <div className="col-lg-4 col-md-6 col-sm-12">
                          <div className="input-blocks">
                            <label>Total</label>
                            <input type="text" defaultValue={0} />
                          </div>
                        </div>
                        <div className="col-lg-4 col-md-6 col-sm-12">
                        <div className="input-blocks">
                          <label>Fecha Compra</label>
                          <div className="input-groupicon calender-input">
                            <Calendar className="info-img" />
                            <DatePicker
                              selected={selectedDate}
                              onChange={handleDateChange}
                              type="date"
                              className="filterdatepicker"
                              dateFormat="dd-MM-yyyy"
                              placeholder="Elegir fecha"
                            />
                          </div>
                        </div>
                      </div>
                      </div>
                    </div>
                    <div className="col-lg-12">
                      <div className="modal-footer-btn">
                        <button
                          type="button"
                          className="btn btn-cancel me-2"
                          data-bs-dismiss="modal"
                        >
                          Cancelar
                        </button>
                        <Link to="#" className="btn btn-submit">
                          Guardar
                        </Link>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Add Purchase */}
    </div>
  );
};

export default AddPurchases;
