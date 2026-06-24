# MongoDB Migration Guide

## Tổng quan
Dự án đã di chuyển từ **Firebase** sang **MongoDB** với xác thực JWT + bcrypt.

## Cấu hình MongoDB

### 1. Cài đặt Dependencies
```bash
npm install
```

### 2. Cấu hình Environment Variables
Tạo file `.env.local` dựa trên `.env.example`:

```env
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/ariha-workhub
# Hoặc MongoDB Atlas:
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ariha-workhub

# JWT Secret (thay đổi trong production)
JWT_SECRET=your-super-secret-key-change-in-production

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

### 3. Setup MongoDB Local (nếu dùng local)
```bash
# Windows với MongoDB Community Edition
mongod

# Hoặc dùng Docker
docker run -d -p 27017:27017 -v mongo_data:/data/db --name mongodb mongo:latest
```

### 4. Khởi động Development
```bash
npm run dev
```

## Cấu trúc Databases

### Collections
- **users** - Lưu trữ thông tin người dùng (hashed password)
- **tasks** - Quản lý các nhiệm vụ
- **notifications** - Thông báo cho người dùng
- **emailLogs** - Lịch sử email gửi đi (TODO)
- **calendarEvents** - Sự kiện lịch (TODO)
- **evaluations** - Đánh giá hiệu suất (TODO)

### Collections chưa migrate (TODO):
- **workflows**
- **milestoneConfig**
- **kpiFrameworks**
- **requestTemplates**
- **requests**
- **folders** (documents)
- **documents**
- **announcements**
- **channels**
- **permissionConfig**
- **evaluationConfig**

## Authentication Flow

### Login với Email/Password
1. Client gửi `POST /api/auth/login` với email & password
2. Server hash password và compare với stored hash
3. Return JWT token trong response
4. Token được lưu trong cookie (httpOnly, secure)

### Register
1. Client gửi `POST /api/auth/register` với email, password, name
2. Server hash password và lưu vào MongoDB
3. User được tạo với role `guest` (chờ Admin phân quyền)
4. Return JWT token

### Logout
1. Client gửi `POST /api/auth/logout`
2. Token cookie bị xóa

## Migration Status

### ✅ Hoàn thành
- [x] Setup MongoDB config
- [x] Tạo User schema & model
- [x] Tạo Task schema & model
- [x] Tạo Notification schema & model
- [x] JWT authentication utils
- [x] API routes: login, register, logout
- [x] Update login page để dùng API
- [x] Environment configuration

### 🔄 Đang làm/TODO
- [ ] Hoàn thành tất cả collections (workflows, documents, etc.)
- [ ] Cập nhật tất cả components import từ Firebase
- [ ] Thay đổi real-time subscriptions (Firestore → polling hoặc changeStreams)
- [ ] Update API routes khác (tasks, notifications, etc.)
- [ ] Integration tests

### ❌ Chưa bắt đầu
- [ ] Google OAuth integration (nếu cần)
- [ ] Data migration từ Firestore sang MongoDB
- [ ] Performance optimization & indexing

## Lưu ý quan trọng

1. **Password Hashing**: Tất cả passwords được hash với bcryptjs trước khi lưu
2. **JWT Expiry**: Token hết hạn sau 7 ngày
3. **Real-time Updates**: MongoDB không có real-time listeners như Firestore
   - Hiện tại: Dùng polling (gọi API)
   - Tương lai: Dùng MongoDB changeStreams hoặc Socket.io
4. **Migrations từ Firebase**: Cần chạy script để export Firestore → MongoDB (chưa tạo)

## Troubleshooting

### MongoDB Connection Error
```
ECONNREFUSED: connection refused 127.0.0.1:27017
```
- Kiểm tra MongoDB đang chạy: `mongosh` hoặc `mongo`
- Hoặc dùng MongoDB Atlas (cloud)

### JWT Secret không được cấu hình
```
MONGODB_URI environment variable is not set
```
- Tạo file `.env.local` với `MONGODB_URI`

### Model not found
- Đảm bảo MongoDB đang kết nối (`connectDB()`)
- Check xem collection name đúng không

## Next Steps

1. Migrate tất cả collections cần thiết
2. Update tất cả Firebase imports sang MongoDB
3. Thêm MongoDB changeStreams cho real-time updates
4. Setup CI/CD để automatic migrate data từ Firebase
5. Testing comprehensive trước deploy production
