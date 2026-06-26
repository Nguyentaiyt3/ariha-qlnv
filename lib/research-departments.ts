export interface Department {
  abbr: string;
  name: string;
  crossReview?: string;
}

export const DEPARTMENTS: Department[] = [
  { abbr: "BGĐ",        name: "Ban Giám Đốc",                                                           crossReview: "HSTCCĐ, TMCCCT, GMHS" },
  { abbr: "CC",         name: "Khoa Cấp cứu",                                                           crossReview: "TDCN, GPB, HH" },
  { abbr: "CĐHA",       name: "Khoa Chẩn đoán hình ảnh",                                                crossReview: "Nội nhiễm, VS, KSNK" },
  { abbr: "Da liễu",    name: "Khoa Da liễu - Miễn dịch - Dị ứng",                                      crossReview: "Nội tiết, Nội TH, PHCN" },
  { abbr: "DD",         name: "Khoa Dinh dưỡng lâm sàng",                                               crossReview: "KSNK, Hóa sinh, ĐTCBCC" },
  { abbr: "Dược",       name: "Khoa Dược",                                                               crossReview: "Nội TM, Nội tiết, Nội TYC" },
  { abbr: "ĐTCBCC",     name: "Khoa Điều trị cán bộ cao cấp",                                           crossReview: "CĐHA, HH, VS" },
  { abbr: "GPB",        name: "Khoa Giải phẫu bệnh",                                                    crossReview: "HH, VS, Dược" },
  { abbr: "SH",         name: "Khoa Hóa sinh",                                                          crossReview: "CC, GMHS, TMCCCT" },
  { abbr: "HSTCCĐ",     name: "Khoa Hồi sức tích cực - Chống độc",                                      crossReview: "SH, VS, GPB" },
  { abbr: "HH",         name: "Khoa Huyết học",                                                         crossReview: "KB-TYC, TDCN, KHTH" },
  { abbr: "KB-A",       name: "Khoa Khám bệnh",                                                         crossReview: "KB-A, TDCN, KHTH" },
  { abbr: "KB-TYC",     name: "Khoa Khám bệnh theo yêu cầu",                                            crossReview: "Dược, VS, HSTCCĐ" },
  { abbr: "KSNK",       name: "Khoa Kiểm soát nhiễm khuẩn",                                             crossReview: "TMH, RHM, NgTYC" },
  { abbr: "Mắt",        name: "Khoa Mắt",                                                               crossReview: "PHCN, NgTK, Nội CXK" },
  { abbr: "NgCTCH",     name: "Khoa Ngoại chấn thương chỉnh hình",                                      crossReview: "NgT-TN, NgTM-LN, UB" },
  { abbr: "NgTYC",      name: "Khoa Ngoại điều trị theo yêu cầu",                                       crossReview: "NgTH, Nội TH, NgTYC" },
  { abbr: "NgGM",       name: "Khoa Ngoại gan mật",                                                     crossReview: "Nội thận, NgTYC, NgTM-LN" },
  { abbr: "NgT-TN",     name: "Khoa Ngoại thận - Tiết niệu",                                            crossReview: "Nội TK, NgCTCH, NgTM-LN" },
  { abbr: "NgTK",       name: "Khoa Ngoại thần kinh",                                                   crossReview: "Nội TH, NgGM, NgTYC" },
  { abbr: "NgTH",       name: "Khoa Ngoại tiêu hóa",                                                    crossReview: "TMCCCT, NgTK, NgTYC" },
  { abbr: "NgTM-LN",    name: "Khoa Ngoại tim mạch – Lồng ngực",                                        crossReview: "Nội TM, TMCCCT, HSTCCĐ" },
  { abbr: "Nhịp tim",   name: "Khoa Nhịp tim",                                                          crossReview: "NgCTCH, PHCN, Nội tiết" },
  { abbr: "Nội CXK",    name: "Khoa Nội cơ xương khớp",                                                 crossReview: "ĐTCBCC, Nội tiết, Nội TM" },
  { abbr: "Nội TYC",    name: "Khoa Nội điều trị theo yêu cầu",                                         crossReview: "Nội thận, Nội TM, Nội tiết" },
  { abbr: "Nội HH",     name: "Khoa Nội hô hấp",                                                        crossReview: "VS, KSNK, HSTCCĐ" },
  { abbr: "Nội nhiễm",  name: "Khoa Nội nhiễm",                                                         crossReview: "Nội tiết, Nội TH, Nội CXK" },
  { abbr: "Nội thận",   name: "Khoa Nội thận - Lọc máu",                                                crossReview: "NgTK, PHCN, ĐTCBCC" },
  { abbr: "Nội TK",     name: "Khoa Nội thần kinh",                                                     crossReview: "Nội thận, Nội TM, Nội TH" },
  { abbr: "Nội tiết",   name: "Khoa Nội tiết",                                                          crossReview: "Nội tiết, Nội thận, Nội CXK" },
  { abbr: "Nội TH",     name: "Khoa Nội tiêu hóa",                                                      crossReview: "TMCCCT, Nội tiết, Nội HH" },
  { abbr: "Nội TM",     name: "Khoa Nội tim mạch",                                                      crossReview: "HSTCCĐ, CC, NgTM-LN" },
  { abbr: "GMHS",       name: "Khoa Phẫu thuật - Gây mê hồi sức",                                       crossReview: "RHM, NgTYC, Mắt" },
  { abbr: "PTHM-TM",    name: "Khoa Phẫu thuật hàm mặt - Tạo hình thẩm mỹ",                            crossReview: "NgCTCH, Nội CXK, YHCT" },
  { abbr: "PHCN",       name: "Khoa Phục hồi chức năng",                                                crossReview: "Mắt, RHM, NgTK" },
  { abbr: "TMH",        name: "Khoa Tai mũi họng",                                                      crossReview: "CĐHA, KB-A, Nội TH" },
  { abbr: "TDCN",       name: "Khoa Thăm dò chức năng và nội soi",                                      crossReview: "Nội TM, HSTCCĐ, CC" },
  { abbr: "TMCCCT",     name: "Khoa Tim mạch cấp cứu - can thiệp",                                      crossReview: "GPB, NgTYC, Nội TYC" },
  { abbr: "UB",         name: "Khoa Ung bướu",                                                          crossReview: "HH, SH, KSNK" },
  { abbr: "VS",         name: "Khoa Vi sinh",                                                            crossReview: "PHCN, Nội CXK, Nội tiết" },
  { abbr: "YHCT",       name: "Khoa Y học cổ truyền",                                                   crossReview: "Nội TYC, Nội HH, Nội TK" },
  { abbr: "2B",         name: "Phòng Bảo vệ sức khoẻ trung ương 2B",                                    crossReview: "TTBYT, TCKT, KHTH" },
  { abbr: "CNTT",       name: "Phòng Công nghệ thông tin",                                              crossReview: "KHTH, ĐD, TCCB" },
  { abbr: "PĐT",        name: "Phòng Đào tạo - Chỉ đạo tuyến",                                          crossReview: "KHTH, KSNK, PHCN" },
  { abbr: "ĐD",         name: "Phòng Điều dưỡng",                                                       crossReview: "PQT, TCCB, TCKT" },
  { abbr: "PHC",        name: "Phòng Hành chính",                                                       crossReview: "ĐD, TCCB, CNTT" },
  { abbr: "KHTH",       name: "Phòng Kế hoạch tổng hợp",                                                crossReview: "KHTH, ĐD, CNTT" },
  { abbr: "QLCL",       name: "Phòng Quản lý chất lượng và Công tác xã hội",                            crossReview: "TCCB, TCKT, CNTT" },
  { abbr: "PQT",        name: "Phòng Quản trị",                                                         crossReview: "TCCB, PQT, CNTT" },
  { abbr: "TCKT",       name: "Phòng Tài chính kế toán",                                                crossReview: "CNTT, PQT, GMHS" },
  { abbr: "TBYT",       name: "Phòng Thiết bị y tế",                                                    crossReview: "KHTH, TCKT, PQT" },
  { abbr: "TCCB",       name: "Phòng Tổ chức cán bộ",                                                   crossReview: "Viện ARiHA, PĐT, KHTH" },
  { abbr: "Tạp chí SK&LH", name: "Tạp chí sức khỏe và lão hóa",                                        crossReview: "Mắt, TMH, NgCTCH" },
  { abbr: "BIORACT",    name: "Trung tâm nghiên cứu Tương đương sinh học và Thử nghiệm lâm sàng Thống Nhất" },
  { abbr: "RHM",        name: "Trung tâm Răng Hàm Mặt Kỹ thuật cao" },
  { abbr: "Viện ARiHA", name: "Viện ARiHA" },
];

export const DEPT_BY_ABBR = Object.fromEntries(DEPARTMENTS.map(d => [d.abbr, d]));
export const DEPT_OPTIONS  = DEPARTMENTS.map(d => ({ value: d.abbr, label: `${d.abbr} — ${d.name}` }));

export const COMPLETION_QUARTERS = ["Quý I", "Quý II", "Quý III", "Quý IV"] as const;
export const COMPLETION_YEARS    = [2026, 2027, 2028, 2029] as const;
