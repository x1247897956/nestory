import io,pathlib,sqlite3,tarfile,tempfile,unittest
from contextlib import closing
from unittest.mock import patch
from scripts import operations
from scripts.operations import archive_snapshot
class Archive(unittest.TestCase):
 def test_snapshot_closes_database_before_returning(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp)
   with closing(sqlite3.connect(root/'noteapp.db')) as db,db:db.executescript('CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES(1); CREATE TABLE assets(id TEXT,storage_key TEXT,size INTEGER);')
   connections=[];connect=sqlite3.connect
   def tracked(*args,**kwargs):
    connection=connect(*args,**kwargs);connections.append(connection);return connection
   try:
    with patch.object(operations.sqlite3,'connect',tracked):operations.snapshot(root)
    with self.assertRaises(sqlite3.ProgrammingError):connections[0].execute('SELECT 1')
   finally:
    for connection in connections:connection.close()
 def test_complete_uncheckpointed_wal_snapshot(self):
  with tempfile.TemporaryDirectory() as tmp:
   root=pathlib.Path(tmp);data=root/'data';data.mkdir();db=sqlite3.connect(data/'noteapp.db');db.execute('PRAGMA journal_mode=WAL');db.executescript('CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES(1); CREATE TABLE assets(id TEXT,storage_key TEXT,size INTEGER); CREATE TABLE proof(value TEXT); INSERT INTO proof VALUES("uncheckpointed");');db.commit()
   self.assertTrue((data/'noteapp.db-wal').exists());self.assertTrue((data/'noteapp.db-shm').exists());archive=root/'backup.tar.gz'
   with tarfile.open(archive,'w:gz') as tf:
    for file in data.iterdir():tf.add(file,arcname='./'+file.name)
   manifest=archive_snapshot(archive);self.assertEqual(manifest['counts']['proof'],1);self.assertIn('noteapp.db-wal',manifest['files']);self.assertIn('noteapp.db-shm',manifest['files']);db.close()
 def test_traversal_archive_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   archive=pathlib.Path(tmp)/'bad.tar.gz'
   with tarfile.open(archive,'w:gz') as tf:
    member=tarfile.TarInfo('../escape');member.size=1;tf.addfile(member,io.BytesIO(b'x'))
   with self.assertRaises(ValueError):archive_snapshot(archive)
if __name__=='__main__':unittest.main(verbosity=2)
