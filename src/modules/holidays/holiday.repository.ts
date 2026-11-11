import { connectToDatabase } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { HolidayEntity } from './holiday.entity';
import { CreateHolidayDto, UpdateHolidayDto, QueryHolidayFilterDto } from './holiday.dto';

export class HolidayRepository {
  private async getCollection(orgId: string = 'org-default') {
    const { db } = await connectToDatabase();
    return { db, coll: db.collection('holidays') };
  }

  async findAll(filter: QueryHolidayFilterDto = {}, orgId: string = 'org-default'): Promise<{ items: HolidayEntity[]; total: number }> {
    const { coll } = await this.getCollection(orgId);

    const query: any = { organizationId: orgId };
    if (filter.country) {
      query.country = new RegExp(`^${filter.country}$`, 'i');
    }
    if (filter.category) {
      query.category = filter.category;
    }
    if (filter.state) {
      query.state = new RegExp(`^${filter.state}$`, 'i');
    }
    if (filter.year) {
      query.date = new RegExp(`^${filter.year}-`);
    }

    const total = await coll.countDocuments(query);
    const page = filter.page || 1;
    const limit = filter.limit || 50;

    const docs = await coll
      .find(query)
      .sort({ date: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    const items: HolidayEntity[] = docs.map((d) => ({
      id: d.id || d._id.toString(),
      name: d.name,
      description: d.description || null,
      date: d.date,
      category: d.category,
      country: d.country || 'IN',
      state: d.state || null,
      isOptional: Boolean(d.isOptional),
      isMandatory: Boolean(d.isMandatory),
      status: d.status || 'ACTIVE',
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
    }));

    return { items, total };
  }

  async findById(id: string, orgId: string = 'org-default'): Promise<HolidayEntity | null> {
    const { coll } = await this.getCollection(orgId);
    const objIdQuery = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id as any };
    const d = await coll.findOne({ organizationId: orgId, $or: [{ id }, objIdQuery] });
    if (!d) return null;

    return {
      id: d.id || d._id.toString(),
      name: d.name,
      description: d.description || null,
      date: d.date,
      category: d.category,
      country: d.country || 'IN',
      state: d.state || null,
      isOptional: Boolean(d.isOptional),
      isMandatory: Boolean(d.isMandatory),
      status: d.status || 'ACTIVE',
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: d.updatedAt ? new Date(d.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  async findByYearAndCountry(year: number, country: string = 'IN', orgId: string = 'org-default'): Promise<HolidayEntity[]> {
    const { items } = await this.findAll({ year, country }, orgId);
    return items;
  }

  async findDuplicate(name: string, date: string, country: string, orgId: string = 'org-default'): Promise<HolidayEntity | null> {
    const { coll } = await this.getCollection(orgId);
    const d = await coll.findOne({
      organizationId: orgId,
      name: new RegExp(`^${name}$`, 'i'),
      date,
      country: new RegExp(`^${country}$`, 'i'),
    });
    if (!d) return null;
    return this.findById(d.id || d._id.toString(), orgId);
  }

  async create(dto: CreateHolidayDto, orgId: string = 'org-default'): Promise<HolidayEntity> {
    const { coll } = await this.getCollection(orgId);
    const now = new Date();
    const id = `hol-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const doc = {
      id,
      organizationId: orgId,
      name: dto.name,
      description: dto.description || null,
      date: dto.date,
      category: dto.category,
      country: dto.country || 'IN',
      state: dto.state || null,
      isOptional: dto.isOptional ?? false,
      isMandatory: dto.isMandatory ?? true,
      status: dto.status || 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    await coll.insertOne(doc);
    return {
      ...doc,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  }

  async createMany(dtos: Omit<HolidayEntity, 'id' | 'createdAt' | 'updatedAt'>[], orgId: string = 'org-default'): Promise<HolidayEntity[]> {
    const createdItems: HolidayEntity[] = [];
    for (const dto of dtos) {
      const existing = await this.findDuplicate(dto.name, dto.date, dto.country || 'IN', orgId);
      if (!existing) {
        const item = await this.create({
          name: dto.name,
          description: dto.description || undefined,
          date: dto.date,
          category: dto.category as any,
          country: dto.country,
          state: dto.state || undefined,
          isOptional: dto.isOptional,
          isMandatory: dto.isMandatory,
          status: dto.status as any,
        }, orgId);
        createdItems.push(item);
      }
    }
    return createdItems;
  }

  async update(id: string, dto: UpdateHolidayDto, orgId: string = 'org-default'): Promise<HolidayEntity | null> {
    const { coll } = await this.getCollection(orgId);
    const now = new Date();
    const objIdQuery = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id as any };

    await coll.updateOne(
      { organizationId: orgId, $or: [{ id }, objIdQuery] },
      { $set: { ...dto, updatedAt: now } }
    );

    return this.findById(id, orgId);
  }

  async delete(id: string, orgId: string = 'org-default'): Promise<boolean> {
    const { coll } = await this.getCollection(orgId);
    const objIdQuery = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { _id: id as any };
    const res = await coll.deleteOne({ organizationId: orgId, $or: [{ id }, objIdQuery] });
    return res.deletedCount > 0;
  }
}
