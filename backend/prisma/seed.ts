import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Datos de ejemplo para desarrollo. NO usar en producción.
async function main() {
  const passwordHash = await bcrypt.hash('password123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@empresa.com' },
    update: {},
    create: {
      name: 'Administradora Demo',
      email: 'admin@empresa.com',
      passwordHash,
      role: 'ADMIN',
    },
  });

  const employee = await prisma.user.upsert({
    where: { email: 'empleado@empresa.com' },
    update: {},
    create: {
      name: 'Empleado Demo',
      email: 'empleado@empresa.com',
      passwordHash,
      role: 'EMPLOYEE',
    },
  });

  const existing = await prisma.foundItem.count();
  if (existing === 0) {
    await prisma.foundItem.createMany({
      data: [
        {
          title: 'Botella de agua azul',
          description: 'Botella térmica azul encontrada en la sala de juntas 2.',
          category: 'OTHER',
          location: 'Sala de juntas 2',
          foundAt: new Date(),
          status: 'PUBLISHED',
          reporterId: employee.id,
        },
        {
          title: 'Juego de llaves con llavero rojo',
          description: 'Tres llaves con un llavero rojo, encontradas cerca de la cafetería.',
          category: 'KEYS',
          location: 'Cafetería',
          foundAt: new Date(),
          status: 'PUBLISHED',
          reporterId: admin.id,
        },
        {
          title: 'Audífonos inalámbricos',
          description: 'Estuche de audífonos blanco, encontrado en el estacionamiento.',
          category: 'ELECTRONICS',
          location: 'Estacionamiento nivel 1',
          foundAt: new Date(),
          status: 'PUBLISHED',
          reporterId: employee.id,
        },
      ],
    });

    await prisma.lostReport.create({
      data: {
        title: 'Paraguas negro',
        description: 'Paraguas plegable negro, marca genérica. Lo perdí el lunes.',
        category: 'OTHER',
        location: 'Entrada principal',
        lostAt: new Date(),
        status: 'OPEN',
        reporterId: employee.id,
      },
    });
  }

  console.log('Seed completado.');
  console.log('  admin@empresa.com / password123 (ADMIN)');
  console.log('  empleado@empresa.com / password123 (EMPLOYEE)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
