<?php
namespace FreePBX\Console\Command;

use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

class Materialpbx extends Command
{
    protected $FreePBX;

    public function __construct()
    {
        $this->FreePBX = \FreePBX::create();
        parent::__construct();
    }

    protected function configure()
    {
        $this->setName('materialpbx')
            ->setDescription('Run bounded MaterialPBX bridge operations')
            ->addOption('operation', null, InputOption::VALUE_REQUIRED, 'sync or submit-call-file')
            ->addOption('kind', null, InputOption::VALUE_REQUIRED)
            ->addOption('id', null, InputOption::VALUE_REQUIRED)
            ->addOption('request-snapshot', null, InputOption::VALUE_REQUIRED)
            ->addOption('expected-sha256', null, InputOption::VALUE_REQUIRED)
            ->addOption('expected-revision', null, InputOption::VALUE_REQUIRED)
            ->addOption('snapshot-id', null, InputOption::VALUE_REQUIRED)
            ->addOption('deleted', null, InputOption::VALUE_NONE);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        try {
            $module = $this->FreePBX->Materialpbx;
            $operation = (string) $input->getOption('operation');
            if ($operation === 'sync') {
                $revisionText = (string) $input->getOption('expected-revision');
                if (!preg_match('/^[1-9][0-9]*$/D', $revisionText)) {
                    throw new \InvalidArgumentException('Expected revision must be a positive integer');
                }
                $revision = filter_var($revisionText, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
                if ($revision === false) {
                    throw new \InvalidArgumentException('Expected revision is outside the supported integer range');
                }
                $result = $module->syncResource(
                    (string) $input->getOption('kind'),
                    (string) $input->getOption('id'),
                    (bool) $input->getOption('deleted'),
                    (string) $input->getOption('request-snapshot'),
                    (string) $input->getOption('expected-sha256'),
                    $revision
                );
            } elseif ($operation === 'submit-call-file') {
                $result = $module->submitCallFile((string) $input->getOption('id'));
            } elseif ($operation === 'rollback-compiler') {
                $result = $module->rollbackCompilation((string) $input->getOption('snapshot-id'));
            } else {
                throw new \InvalidArgumentException('Unknown operation');
            }
            $output->writeln(json_encode($result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES));
            return Command::SUCCESS;
        } catch (\Throwable $error) {
            $output->getErrorOutput()->writeln($error->getMessage());
            return Command::FAILURE;
        }
    }
}
